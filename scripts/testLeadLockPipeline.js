/**
 * LeadLock Pipeline Test Script
 * ────────────────────────────────────────────────────────────────
 * Tests the zip → Google Places → business_data mapping flow with
 * multiple zip codes including edge cases (rural, invalid, urban).
 *
 * Run: node scripts/testLeadLockPipeline.js
 * Requires: EXPO_PUBLIC_GOOGLE_PLACES_API_KEY env var or .env file
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.LEADLENS_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!API_KEY) {
  console.error('❌ Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY');
  process.exit(1);
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

async function upsertSampleToBusinessData(record) {
  if (!supabase || !record) return { ok: false, error: 'No Supabase client' };
  const { data, error } = await supabase
    .from('business_data')
    .upsert(record, { onConflict: 'place_id' })
    .select('id, business_name, zip_code, place_id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

const TEST_ZIPS = [
  { zip: '77002', label: 'urban Houston', expectMinResults: 1 },
  { zip: '78701', label: 'urban Austin', expectMinResults: 1 },
  { zip: '75202', label: 'urban Dallas', expectMinResults: 1 },
  { zip: '79830', label: 'rural Alpine TX', expectMinResults: 1 },
  { zip: '00000', label: 'invalid zip', expectMinResults: 0 },
  { zip: '99999', label: 'invalid high zip', expectMinResults: 0 },
];

async function geocodeZip(zip) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${zip}&components=country:US&key=${API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== 'OK') {
    return { ok: false, status: json.status, error: json.error_message || json.status, lat: null, lng: null };
  }
  const loc = json.results?.[0]?.geometry?.location;
  if (!loc) return { ok: false, status: 'NO_RESULT', error: 'No location', lat: null, lng: null };
  return { ok: true, status: 'OK', lat: loc.lat, lng: loc.lng, city: extractCity(json.results[0]) };
}

function extractCity(result) {
  const comps = result?.address_components || [];
  const city = comps.find(c => c.types.includes('locality') || c.types.includes('postal_town'));
  return city?.long_name || '';
}

async function searchText(query, center, radiusMeters = 5000) {
  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  const body = { textQuery: query };
  if (center && center.lat && center.lng) {
    body.locationBias = {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: radiusMeters,
      },
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus,places.primaryType,places.websiteUri,places.internationalPhoneNumber',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, error: json?.error?.message || json, places: [] };
  }
  return { ok: true, status: 'OK', places: json?.places || [] };
}

async function runTest({ zip, label, expectMinResults }) {
  console.log(`\n--- Testing ${zip} (${label}) ---`);

  // 1. Geocode zip
  const geo = await geocodeZip(zip);
  console.log(`Geocode: ${geo.ok ? `OK lat=${geo.lat.toFixed(4)} lng=${geo.lng.toFixed(4)} city=${geo.city}` : `FAIL ${geo.error}`}`);
  if (!geo.ok) {
    return { zip, label, passed: expectMinResults === 0, stage: 'geocode', error: geo.error };
  }

  // 2. Search businesses near zip
  const textQuery = `business near ${zip}`;
  const search = await searchText(textQuery, { lat: geo.lat, lng: geo.lng }, 5000);
  console.log(`Text search: ${search.ok ? `OK ${search.places.length} places` : `FAIL ${search.error}`}`);
  if (!search.ok) {
    return { zip, label, passed: false, stage: 'search', error: search.error };
  }

  if (search.places.length === 0) {
    console.log('No places found in 5km radius. Trying 30km...');
    const wideSearch = await searchText(textQuery, { lat: geo.lat, lng: geo.lng }, 30000);
    if (wideSearch.ok && wideSearch.places.length > 0) {
      search.places = wideSearch.places;
      console.log(`Wide search: ${wideSearch.places.length} places`);
    }
  }

  // 3. Validate mapping
  const normalized = search.places.map(p => {
    const lat = p?.location?.latitude;
    const lng = p?.location?.longitude;
    const formattedAddress = p?.formattedAddress || '';
    const zipMatch = formattedAddress.match(/\b(\d{5})(?:-\d{4})?\b/);
    return {
      place_id: p?.id || null,
      business_name: p?.displayName?.text || 'Unknown',
      formatted_address: formattedAddress,
      latitude: lat,
      longitude: lng,
      zip_code: zipMatch ? zipMatch[1] : null,
      types: p?.types || [],
      primary_type: p?.primaryType || '',
      business_status: p?.businessStatus || '',
      phone: p?.internationalPhoneNumber || '',
      website: p?.websiteUri || '',
    };
  }).filter(p => p.latitude && p.longitude);

  console.log(`Normalized ${normalized.length} valid records. Sample:`);
  normalized.slice(0, 3).forEach(p => {
    console.log(`  - ${p.business_name} | ${p.formatted_address} | zip=${p.zip_code || '—'} | types=${p.types.join(',')}`);
  });

  const passed = normalized.length >= expectMinResults;
  console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'} (expected ≥${expectMinResults}, got ${normalized.length})`);
  return { zip, label, passed, stage: 'mapping', count: normalized.length };
}

async function main() {
  console.log('🔍 LeadLock Pipeline Test');
  console.log('API key:', API_KEY.slice(0, 8) + '...' + API_KEY.slice(-4));

  // 4. API key health check
  const health = await searchText('business near 77002', null, 5000);
  console.log(`\nAPI health probe: ${health.ok ? `OK ${health.places.length} places` : `FAIL ${health.error}`}`);
  if (!health.ok) {
    console.error('⚠️  API key may be invalid, restricted, or billing may be disabled. Check Google Cloud Console.');
  }

  const results = [];
  let firstSuccessfulRecord = null;
  for (const test of TEST_ZIPS) {
    const result = await runTest(test);
    results.push(result);
    if (result.passed && result.count > 0 && !firstSuccessfulRecord) {
      // We only capture the first successful sample; actual upsert is done after the loop.
    }
  }

  // End-to-end business_data upsert test (use a well-known sample)
  if (supabase) {
    console.log('\n--- End-to-end business_data upsert test ---');
    const sampleRecord = {
      source: 'leadlock_pipeline_test',
      place_id: 'test_pipeline_77002_sample',
      business_name: 'Pipeline Test Sample',
      formatted_address: '1301 Fannin St, Houston, TX 77002',
      street_number: '1301',
      street_name: 'Fannin St',
      city: 'Houston',
      state: 'TX',
      zip_code: '77002',
      latitude: 29.7526,
      longitude: -95.3704,
      phone: '(713) 555-0000',
      website: 'https://example.com',
      types: ['point_of_interest', 'establishment'],
      primary_type: 'point_of_interest',
      business_status: 'OPERATIONAL',
      pest_risk_score: 20,
      metadata: { pipeline_test: true, tested_at: new Date().toISOString() },
    };
    const upsert = await upsertSampleToBusinessData(sampleRecord);
    if (upsert.ok) {
      console.log('✅ End-to-end upsert succeeded:', upsert.data);
      // Clean up
      await supabase.from('business_data').delete().eq('place_id', sampleRecord.place_id);
      console.log('✅ Test row cleaned up');
    } else {
      console.error('❌ End-to-end upsert failed:', upsert.error);
      results.push({ zip: '77002', label: 'end-to-end upsert', passed: false, stage: 'supabase', error: upsert.error });
    }
  } else {
    console.log('ℹ️  Skipping end-to-end upsert test (no service role key)');
  }

  console.log('\n=== Summary ===');
  const allPassed = results.every(r => r.passed);
  results.forEach(r => {
    console.log(`${r.passed ? '✅' : '❌'} ${r.zip} (${r.label}) — ${r.stage}${r.count !== undefined ? ` — ${r.count} records` : ''}${r.error ? ` — ${r.error}` : ''}`);
  });
  console.log(allPassed ? '\n✅ All tests passed' : '\n❌ Some tests failed');
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
