'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^['\x22]|['\x22]$/g, '');
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL || 'https://qkbvwryucaakkkqaqvka.supabase.co';
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set in .env');
  process.exit(1);
}

const STATE_URLS = {
  TX: 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/tx_texas_zip_codes_geo.min.json',
  LA: 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/la_louisiana_zip_codes_geo.min.json',
  MA: 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/ma_massachusetts_zip_codes_geo.min.json',
};

function toCoord(point) {
  if (Array.isArray(point) && point.length >= 2) {
    return { latitude: Number(point[1]), longitude: Number(point[0]) };
  }
  if (point && typeof point === 'object') {
    const lat = Number(point.latitude ?? point.lat);
    const lng = Number(point.longitude ?? point.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { latitude: lat, longitude: lng };
  }
  return null;
}

function normalizeRing(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(toCoord).filter(Boolean);
}

function extractAllRings(feature) {
  const rings = [];
  const geometry = feature?.geometry;
  if (!geometry) return rings;

  const addRing = (coords) => {
    const ring = normalizeRing(coords);
    if (ring.length >= 3) rings.push(ring);
  };

  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(addRing);
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((polygon) => polygon.forEach(addRing));
  }

  return rings;
}

function computeCenter(allRings) {
  const points = allRings.flat();
  if (!points.length) return null;
  return {
    latitude: points.reduce((sum, p) => sum + p.latitude, 0) / points.length,
    longitude: points.reduce((sum, p) => sum + p.longitude, 0) / points.length,
  };
}

function getZipCode(feature) {
  const props = feature?.properties || {};
  return props.ZCTA5CE10 || props.GEOID10 || props.zip || props.ZIP || props.ZIPCODE;
}

async function upsertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/zip_boundaries?on_conflict=zip_code`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert failed: ${err}`);
  }
}

async function processState(state, url) {
  console.log(`\n=== Processing ${state} ===`);
  console.log(`Downloading ${url}...`);
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`  Failed to download ${state} GeoJSON: ${resp.status}`);
    return [];
  }
  const geojson = await resp.json();
  console.log(`  Downloaded ${geojson.features?.length || 0} features`);

  const rows = [];
  for (const feature of (geojson.features || [])) {
    const zip = getZipCode(feature);
    if (!zip) continue;

    const all_rings = extractAllRings(feature);
    if (!all_rings.length) continue;

    const polygon = all_rings[0];
    const coords = computeCenter(all_rings);
    if (!coords) continue;

    rows.push({
      zip_code: String(zip).padStart(5, '0'),
      polygon,
      all_rings,
      coords,
    });
  }

  console.log(`  Extracted ${rows.length} ZIP boundaries from ${state}`);
  return rows;
}

async function main() {
  const allRows = [];

  for (const [state, url] of Object.entries(STATE_URLS)) {
    const rows = await processState(state, url);
    allRows.push(...rows);
  }

  console.log(`\n=== Total: ${allRows.length} ZIP boundaries to upload ===`);

  const BATCH = 10;
  let uploaded = 0;

  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    await upsertBatch(batch);
    uploaded += batch.length;
    process.stdout.write(`\rUploaded ${uploaded}/${allRows.length}...`);
  }

  console.log(`\n\nDone! ${uploaded} ZIP boundaries uploaded to Supabase with full-resolution polygons.`);
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
