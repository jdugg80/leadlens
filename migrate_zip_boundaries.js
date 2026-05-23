#!/usr/bin/env node
/**
 * LeadLens — ZIP Boundary Migration
 * Reads zip_boundaries.json and upserts into Supabase zip_boundaries table.
 * 
 * Run once from project root:
 *   node migrate_zip_boundaries.js
 *
 * Supabase table required (run in SQL editor first):
 *   CREATE TABLE IF NOT EXISTS zip_boundaries (
 *     zip        TEXT PRIMARY KEY,
 *     polygon    JSONB,
 *     all_rings  JSONB,
 *     center     JSONB,
 *     source     TEXT DEFAULT 'local',
 *     updated_at TIMESTAMPTZ DEFAULT now()
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_zip_boundaries_zip ON zip_boundaries(zip);
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Load .env
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (k) env[k] = v;
  }
  return env;
}

const env            = loadEnv();
const SUPABASE_URL   = env.EXPO_PUBLIC_SUPABASE_URL || 'https://qkbvwryucaakkkqaqvka.supabase.co';
const SERVICE_KEY    = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌  SUPABASE_SERVICE_ROLE_KEY not set in .env');
  process.exit(1);
}

const ZIP_JSON_PATH = path.join(__dirname, 'assets', 'zip_boundaries.json');
if (!fs.existsSync(ZIP_JSON_PATH)) {
  console.error(`❌  Not found: ${ZIP_JSON_PATH}`);
  process.exit(1);
}

async function upsertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/zip_boundaries`, {
    method: 'POST',
    headers: {
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert failed: ${err}`);
  }
}

async function main() {
  console.log('📂  Reading zip_boundaries.json...');
  const raw  = fs.readFileSync(ZIP_JSON_PATH, 'utf8');
  const data = JSON.parse(raw);

  // Support both array and object formats
  let entries;
  if (Array.isArray(data)) {
    entries = data;
  } else {
    // Object keyed by zip: { "77515": { polygon, allRings, center } }
    entries = Object.entries(data).map(([zip, val]) => ({ zip, ...val }));
  }

  console.log(`✅  Loaded ${entries.length} ZIP boundaries`);

  const BATCH = 200;
  let uploaded = 0;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH).map(e => ({
      zip:       String(e.zip || e.ZCTA5CE10 || e.ZIP || '').padStart(5, '0'),
      polygon:   e.polygon   || e.allRings?.[0] || null,
      all_rings: e.allRings  || e.all_rings     || null,
      center:    e.center    || null,
      source:    'local',
    })).filter(r => r.zip.length === 5);

    await upsertBatch(batch);
    uploaded += batch.length;
    process.stdout.write(`\r⬆️   Uploaded ${uploaded}/${entries.length}...`);
  }

  console.log(`\n\n🎉  Done! ${uploaded} ZIP boundaries in Supabase.`);
}

main().catch(err => {
  console.error('\n❌  Migration failed:', err.message);
  process.exit(1);
});
