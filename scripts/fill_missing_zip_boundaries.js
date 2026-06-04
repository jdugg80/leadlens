'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

const ZIPS = ['77496', '01040', '01103', '01301', '77487'];
const STATE_URLS = {
  TX: 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/tx_texas_zip_codes_geo.min.json',
  MA: 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/ma_massachusetts_zip_codes_geo.min.json',
};

function getStateForZip(zip) {
  const prefix = parseInt(zip.slice(0, 3), 10);
  if ((prefix >= 750 && prefix <= 799) || prefix === 733 || prefix === 885) return 'TX';
  if (prefix >= 10 && prefix <= 27) return 'MA';
  return 'TX';
}

function normalizeRing(coords) {
  return coords
    .map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
}

function extractRings(feature) {
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
    geometry.coordinates.forEach((poly) => poly.forEach(addRing));
  }

  return rings;
}

function computeCenter(allRings) {
  const points = allRings.flat();
  return {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
}

async function loadGeoJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GeoJSON fetch failed: ${response.status}`);
  }
  return response.json();
}

function matchesZip(feature, zip) {
  const props = feature?.properties || {};
  return props.ZCTA5CE10 === zip
    || props.GEOID10 === zip
    || String(props.zip) === zip
    || String(props.ZIP) === zip
    || String(props.ZIPCODE) === zip;
}

async function upsert(rows) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/zip_boundaries?on_conflict=zip_code`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Upsert failed: ${response.status} ${text}`);
  }
  return text;
}

async function main() {
  const geoJsonCache = {};
  const rows = [];

  for (const zip of ZIPS) {
    const state = getStateForZip(zip);
    if (!geoJsonCache[state]) {
      geoJsonCache[state] = await loadGeoJson(STATE_URLS[state]);
    }

    const feature = geoJsonCache[state].features.find((candidate) => matchesZip(candidate, zip));
    if (!feature) {
      console.log(`No feature found for ${zip}`);
      continue;
    }

    const all_rings = extractRings(feature);
    if (!all_rings.length) {
      console.log(`No rings found for ${zip}`);
      continue;
    }

    rows.push({
      zip_code: zip,
      polygon: all_rings[0],
      all_rings,
      coords: computeCenter(all_rings),
    });
  }

  console.log(`Prepared ${rows.length} ZIP boundaries`);
  const result = await upsert(rows);
  console.log(result || 'Upsert complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
