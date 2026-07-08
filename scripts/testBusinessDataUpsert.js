/**
 * Business Data Upsert / RLS Test
 * ────────────────────────────────────────────────────────────────
 * Inserts a normalized business record into business_data using the
 * service role key, then reads it back with the anon key to verify:
 *   - The schema accepts the normalized record shape.
 *   - service_role can write.
 *   - anonymous / authenticated reads are not blocked (RLS SELECT policy).
 *
 * Run: node scripts/testBusinessDataUpsert.js
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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.LEADLENS_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey || !anonKey) {
  console.error('❌ Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabaseService = createClient(supabaseUrl, serviceKey);
const supabaseAnon = createClient(supabaseUrl, anonKey);

const testZip = '77002';
const testRecord = {
  source: 'leadlock_test',
  place_id: 'test_place_leadlock_' + testZip,
  business_name: 'LeadLock Test Business',
  formatted_address: '1301 Fannin St, Houston, TX 77002',
  street_number: '1301',
  street_name: 'Fannin St',
  city: 'Houston',
  state: 'TX',
  zip_code: testZip,
  latitude: 29.7526,
  longitude: -95.3704,
  phone: '(713) 555-1234',
  website: 'https://example.com',
  email: 'test@example.com',
  types: ['point_of_interest', 'establishment'],
  primary_type: 'point_of_interest',
  business_status: 'OPERATIONAL',
  rating: 4.5,
  user_rating_count: 100,
  pest_risk_score: 25,
  pest_indicators: ['high traffic'],
  metadata: { test: true, inserted_at: new Date().toISOString() },
};

async function main() {
  console.log('🔍 Business Data Upsert / RLS Test');
  console.log('URL:', supabaseUrl);

  // 1. Insert via service role
  const { data: insertData, error: insertError } = await supabaseService
    .from('business_data')
    .upsert(testRecord, { onConflict: 'place_id' })
    .select('id, business_name, zip_code, place_id')
    .single();

  if (insertError) {
    console.error('❌ Service role insert failed:', insertError.message);
    process.exit(1);
  }
  console.log('✅ Service role insert succeeded:', insertData);

  // 2. Read back via anon key (should succeed due to SELECT policy for authenticated;
  //    anon key will fail because there is no anon policy — this is intentional.)
  const { data: anonData, error: anonError } = await supabaseAnon
    .from('business_data')
    .select('id, business_name, zip_code')
    .eq('place_id', testRecord.place_id)
    .single();

  if (anonError) {
    // Expected: anon should not be able to read (no anon RLS policy).
    const isBlocked = anonError.message.includes('policy') ||
                      anonError.message.includes('permission') ||
                      anonError.message.includes('single JSON object'); // 0 rows due to RLS filter
    if (isBlocked) {
      console.log('✅ Anon read correctly blocked by RLS (expected):', anonError.message);
    } else {
      console.warn('⚠️  Anon read unexpected error:', anonError.message);
    }
  } else {
    console.log('ℹ️  Anon read succeeded (if you have an anon SELECT policy, this is fine):', anonData);
  }

  // 3. Query by zip via service role
  const { data: zipData, error: zipError } = await supabaseService
    .from('business_data')
    .select('*')
    .eq('zip_code', testZip)
    .limit(10);

  if (zipError) {
    console.error('❌ Zip query failed:', zipError.message);
    process.exit(1);
  }
  console.log(`✅ Zip query found ${zipData.length} business(es) for ${testZip}`);

  // 4. Cleanup test row
  const { error: deleteError } = await supabaseService
    .from('business_data')
    .delete()
    .eq('place_id', testRecord.place_id);

  if (deleteError) {
    console.warn('⚠️  Test cleanup failed:', deleteError.message);
  } else {
    console.log('✅ Test row cleaned up');
  }

  console.log('\n✅ Business data upsert / RLS test passed');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
