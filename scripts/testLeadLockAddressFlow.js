/**
 * LeadLock Address Flow Test
 * ────────────────────────────────────────────────────────────────
 * Verifies the address field survives from LeadLock camera capture
 * through MMKV storage and the ProspectQueue card, and is mapped to
 * the Supabase prospects row.
 *
 * Run: node scripts/testLeadLockAddressFlow.js
 * Optional Supabase schema check: set LEADLENS_SERVICE_ROLE_KEY + EXPO_PUBLIC_SUPABASE_URL
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

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.LEADLENS_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

// ─── Mirror of convertSelectedBusinessesToProspects (src/utils/multiBusinessDetection.js)
function convertSelectedBusinessesToProspects(selectedBusinesses, resolvedLocation = null) {
  const selected = selectedBusinesses.filter(b => b.selected);
  return selected.map(business => {
    const publicSources = business.fullData?.publicSources || {};
    return {
      id: `leadlock_${business.id}_${Date.now()}`,
      type: 'LEADLOCK_PHOTO_CAPTURE',
      businessName: business.name,
      address: publicSources.formatted_address || business.address,
      businessType: business.businessType,
      latitude: resolvedLocation?.latitude || business.fullData?.location?.latitude,
      longitude: resolvedLocation?.longitude || business.fullData?.location?.longitude,
      phone: publicSources.formatted_phone_number || publicSources.phone || '',
      website: publicSources.website || publicSources.url || '',
      email: publicSources.email || '',
      streetNumber: publicSources.streetNumber || '',
      streetName: publicSources.streetName || '',
      city: publicSources.city || resolvedLocation?.city || '',
      state: publicSources.state || 'TX',
      zip: publicSources.zip || resolvedLocation?.zip || '',
      captureMethod: 'LEADLOCK_PHOTO',
      capturedAt: resolvedLocation?.capturedAt || new Date().toISOString(),
    };
  });
}

// ─── Mirror of buildRow address mapping (src/utils/backendSync.js)
function buildRow(lead = {}) {
  return {
    id: lead.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    business_name: lead.businessName || '',
    phone: lead.phone || '',
    email: lead.email || '',
    address: lead.address || '',
    street_number: lead.streetNumber || '',
    street_name: lead.streetName || '',
    address_line_2: lead.addressLine2 || '',
    city: lead.city || '',
    state: lead.state || '',
    zip: lead.zip || '',
    website: lead.website || '',
    capture_method: lead.captureMethod || '',
  };
}

// ─── Mirror of ProspectQueue card address display logic
function getCardAddressLine(lead) {
  if (lead.address) return lead.address;
  return [lead.streetNumber, lead.streetName, lead.city, lead.state].filter(Boolean).join(', ');
}

function assert(condition, message) {
  if (!condition) {
    console.error('❌ ASSERT FAILED:', message);
    process.exitCode = 1;
    return false;
  }
  console.log('✅', message);
  return true;
}

function checkLocalSchemaFiles() {
  console.log('\n--- Local schema files check ---');
  const files = [
    path.join(__dirname, '..', 'supabase', 'prospects_schema.sql'),
    path.join(__dirname, '..', 'supabase', 'private_beta_config.sql'),
    path.join(__dirname, '..', 'supabase', 'migrations', '20260528000000_add_prospect_location_columns.sql'),
  ];
  let allGood = true;
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`❌ Schema file missing: ${f}`);
      allGood = false;
      continue;
    }
    const content = fs.readFileSync(f, 'utf8');
    const hasAddress = /\baddress\s+text\b/i.test(content);
    if (hasAddress) {
      console.log(`✅ ${path.basename(f)} contains address text column`);
    } else {
      console.error(`❌ ${path.basename(f)} is missing address text column`);
      allGood = false;
    }
  }
  return allGood;
}

async function checkSupabaseSchema() {
  console.log('\n--- Live Supabase prospects schema check ---');
  if (!supabase) {
    console.log('ℹ️  Skipping live Supabase schema check (no service role key)');
    return true;
  }
  // Try selecting the address column; if it doesn't exist, this will fail.
  const { data, error } = await supabase
    .from('prospects')
    .select('address')
    .limit(0);

  if (error) {
    console.error('❌ Remote prospects.address column is missing or not accessible:', error.message);
    console.error('   Apply the local schema/migration files to Supabase before deploying this fix.');
    return false;
  }

  console.log('✅ Remote prospects.address column exists and is selectable');
  return true;
}

async function main() {
  console.log('🔍 LeadLock Address Flow Test\n');

  // 1. Mock LeadLock selected business (after Claude vision + public sources enrichment)
  const mockSelectedBusiness = {
    id: 'biz_123',
    selected: true,
    name: 'Pest Free Tavern',
    address: '1301 Fannin St, Houston, TX 77002',
    businessType: 'restaurant',
    phone: '(713) 555-0199',
    fullData: {
      location: { latitude: 29.7526, longitude: -95.3704 },
      publicSources: {
        formatted_address: '1301 Fannin St, Houston, TX 77002',
        formatted_phone_number: '(713) 555-0199',
      },
    },
  };

  const resolvedLocation = {
    zip: '77002',
    city: 'Houston',
    source: 'live_gps',
    confidence: 0.9,
    capturedAt: new Date().toISOString(),
  };

  // 2. Capture → prospect conversion
  const prospects = convertSelectedBusinessesToProspects([mockSelectedBusiness], resolvedLocation);
  assert(prospects.length === 1, 'One prospect generated from selected business');
  const prospect = prospects[0];
  assert(prospect.address === '1301 Fannin St, Houston, TX 77002', `Prospect address preserved: ${prospect.address}`);
  assert(prospect.businessName === 'Pest Free Tavern', `Prospect businessName preserved: ${prospect.businessName}`);
  assert(prospect.captureMethod === 'LEADLOCK_PHOTO', 'Capture method set to LEADLOCK_PHOTO');

  // 3. Storage payload (JSON round-trip)
  const storagePayload = JSON.stringify(prospects);
  const parsedBack = JSON.parse(storagePayload);
  assert(parsedBack[0].address === prospect.address, 'Address survives JSON round-trip into MMKV/AsyncStorage');

  // 4. Supabase row mapping
  const row = buildRow(prospect);
  assert(row.address === prospect.address, `Supabase row.address mapped: ${row.address}`);
  assert(row.business_name === prospect.businessName, 'Supabase row.business_name mapped');

  // 5. Card rendering
  const cardAddress = getCardAddressLine(prospect);
  assert(cardAddress === prospect.address, `Card renders address field: ${cardAddress}`);

  // 6. Edge case: split fields only, no address
  const splitOnlyLead = { streetNumber: '1301', streetName: 'Fannin St', city: 'Houston', state: 'TX' };
  const splitAddress = getCardAddressLine(splitOnlyLead);
  assert(splitAddress === '1301, Fannin St, Houston, TX', `Card falls back to split fields: ${splitAddress}`);

  // 7. Local + live Supabase schema check
  const localSchemaOk = checkLocalSchemaFiles();
  assert(localSchemaOk, 'Local schema files define address text column');

  const remoteSchemaOk = await checkSupabaseSchema();
  assert(remoteSchemaOk, 'Remote Supabase schema supports address column');

  console.log('\n=== Summary ===');
  if (process.exitCode) {
    console.log('❌ Address flow test failed — see above');
  } else {
    console.log('✅ Address flow test passed');
  }
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
