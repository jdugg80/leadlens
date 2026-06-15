/**
 * TargetLens Agent — Homeowner prospect pipeline
 *
 * Pipeline:
 *   1. Fetch property tax records (TX, MA)
 *   2. Fetch MLS recent sales (Redfin CSV)
 *   3. Merge & deduplicate by address
 *   4. Classify ownership (new homeowner / current / rental / investor)
 *   5. Score upgrade efficiency
 *   6. Enrich owner contact info (TruePeopleSearch, rate-limited)
 *   7. Write to Supabase `targetlens_prospects`
 *
 * Usage: node targetlens-agent/agent.js [--lookback 90d] [--state TX]
 */

const { createClient } = require('@supabase/supabase-js');
const { fetchTexasProperties } = require('./sources/texas-tax');
const { fetchMassachusettsParcels } = require('./sources/massachusetts-tax');
const { fetchRedfinListings } = require('./sources/mls-redfin');
const { classifyOwnership, scoreEfficiencyUpgrade, computeDaysSinceTransfer, computeLookbackBucket } = require('./utils/prospectUtils');
const { batchEnrichContacts } = require('./utils/homeownerEnrich');
const { DEFAULT_LOOKBACK, SUPABASE_PROJECT_ID } = require('./config');

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

function parseArgs() {
  const args = process.argv.slice(2);
  const lookup = { lookback: DEFAULT_LOOKBACK, state: null, enrich: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lookback') lookup.lookback = args[++i] || DEFAULT_LOOKBACK;
    if (args[i] === '--state') lookup.state = args[++i] || null;
    if (args[i] === '--enrich') lookup.enrich = true;
  }
  return lookup;
}

function createSupabase() {
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  if (!key) {
    console.error('Set SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY env var');
    process.exit(1);
  }
  return createClient(`https://${SUPABASE_PROJECT_ID}.supabase.co`, key);
}

async function upsertProspects(supabase, prospects) {
  let inserted = 0;
  for (const p of prospects) {
    const { error } = await supabase
      .from('targetlens_prospects')
      .upsert(p, { onConflict: 'id', ignoreDuplicates: false });
    if (error) {
      console.warn(`[Agent] Upsert failed for ${p.address}: ${error.message}`);
    } else {
      inserted++;
    }
  }
  return inserted;
}

async function runPipeline() {
  const args = parseArgs();
  const supabase = createSupabase();
  console.log(`[Agent] Starting TargetLens pipeline — lookback=${args.lookback}, state=${args.state || 'all'}`);

  const allRecords = [];

  // Step 1: Property tax records
  if (!args.state || args.state === 'TX') {
    console.log('[Agent] Fetching Texas property tax records...');
    const txRecords = await fetchTexasProperties();
    console.log(`[Agent] Got ${txRecords.length} TX records`);
    allRecords.push(...txRecords.map(r => ({
      ...r,
      state: 'TX',
      source: 'property-tax-tx',
      sourceType: 'property_tax',
    })));
  }

  if (!args.state || args.state === 'MA') {
    console.log('[Agent] Fetching Massachusetts property tax records...');
    const maRecords = await fetchMassachusettsParcels();
    console.log(`[Agent] Got ${maRecords.length} MA records`);
    allRecords.push(...maRecords.map(r => ({
      ...r,
      state: 'MA',
      source: 'property-tax-ma',
      sourceType: 'property_tax',
    })));
  }

  // Step 2: MLS recent sales
  console.log('[Agent] Fetching MLS/Redfin recent sales...');
  const mlsRecords = await fetchRedfinListings(args.state);
  console.log(`[Agent] Got ${mlsRecords.length} MLS records`);
  allRecords.push(...mlsRecords.map(r => ({
    ...r,
    source: 'mls-redfin',
    sourceType: 'mls',
  })));

  // Step 3: Deduplicate by address
  const seen = new Set();
  const deduped = allRecords.filter(r => {
    const key = `${r.address || ''}|${r.city || ''}|${r.state || ''}`.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`[Agent] Deduped ${allRecords.length} -> ${deduped.length} unique records`);

  // Step 4: Classify ownership
  const classified = deduped.map(r => {
    const ownership = classifyOwnership(r);
    return { ...r, ...ownership };
  });

  // Step 5: Score efficiency upgrade
  const scored = classified.map(r => {
    const scoring = scoreEfficiencyUpgrade(r);
    const daysSinceTransfer = computeDaysSinceTransfer(r.deed_transfer_date);
    const lookbackBucket = computeLookbackBucket(daysSinceTransfer);
    return {
      ...r,
      ...scoring,
      days_since_transfer: daysSinceTransfer,
      lookback_bucket: lookbackBucket,
    };
  });

  // Step 6: Filter by lookback bucket (if specific)
  const filtered = args.lookback
    ? scored.filter(r => r.lookback_bucket === args.lookback || !r.lookback_bucket)
    : scored;

  // Step 7: Enrich contacts (optional, rate-limited)
  let enriched = filtered;
  if (args.enrich) {
    console.log('[Agent] Enriching owner contacts (rate-limited 1 req/2s)...');
    enriched = await batchEnrichContacts(filtered, (progress) => {
      process.stdout.write(`\r[Agent] Enrichment ${progress.current}/${progress.total}`);
    });
    console.log('\n[Agent] Enrichment complete');
  }

  // Step 8: Write to Supabase
  console.log(`[Agent] Upserting ${enriched.length} prospects to Supabase...`);
  const count = await upsertProspects(supabase, enriched);
  console.log(`[Agent] Done — ${count} prospects inserted/updated`);
  console.log('[Agent] Pipeline complete');
}

runPipeline().catch(err => {
  console.error('[Agent] Fatal error:', err.message);
  process.exit(1);
});
