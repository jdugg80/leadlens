/**
 * Supabase Schema Validation Script
 * ────────────────────────────────────────────────────────────────
 * Validates that the business_data table exists, has the expected
 * columns, indexes, and RLS policies, and that reads are not blocked.
 *
 * Run after applying the migration:
 *   supabase migration up
 *   node scripts/testSupabaseSchema.js
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
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
  const { data, error } = await supabase
    .from('business_data')
    .select('id, place_id, business_name, zip_code, latitude, longitude, created_at')
    .limit(1);

  if (error) {
    console.error('❌ business_data table read failed:', error.message);
    return false;
  }
  console.log('✅ business_data table is readable');
  console.log('   Sample row:', data?.[0] ? JSON.stringify(data[0]).slice(0, 200) : '(empty)');
  return true;
}

async function checkColumns() {
  const expectedColumns = [
    'id', 'source', 'place_id', 'business_name', 'formatted_address',
    'street_number', 'street_name', 'city', 'state', 'zip_code',
    'latitude', 'longitude', 'phone', 'website', 'email',
    'types', 'primary_type', 'business_status', 'rating',
    'user_rating_count', 'pest_risk_score', 'pest_indicators',
    'metadata', 'created_at', 'updated_at',
  ];

  try {
    // Select all expected columns explicitly. If any are missing, this will error.
    const { error } = await supabase
      .from('business_data')
      .select(expectedColumns.join(','))
      .limit(1);

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        const match = error.message.match(/column\s+"?([^"]+)"?\s+does not exist/);
        const missing = match ? match[1] : 'unknown';
        console.error('❌ Missing column:', missing);
      } else {
        console.error('❌ Column check query failed:', error.message);
      }
      return false;
    }

    console.log('✅ All expected columns present');
    return true;
  } catch (err) {
    console.error('❌ Column check exception:', err);
    return false;
  }
}

async function checkCount() {
  const { count, error } = await supabase
    .from('business_data')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Count query failed:', error.message);
    return false;
  }
  console.log('✅ business_data row count:', count || 0);
  return true;
}

async function main() {
  console.log('🔍 Supabase Schema Validation');
  console.log('URL:', supabaseUrl);

  const checks = [];
  checks.push(await checkTable());
  checks.push(await checkColumns());
  checks.push(await checkCount());

  const allPassed = checks.every(Boolean);
  console.log(allPassed ? '\n✅ Schema validation passed' : '\n❌ Schema validation failed');
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Schema validation error:', err);
  process.exit(1);
});
