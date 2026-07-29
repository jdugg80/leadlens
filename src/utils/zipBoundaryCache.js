/**
 * zipBoundaryCache.js
 * Gets ZIP boundary data for TerritoryMapScreen.
 * Reads from MMKV/AsyncStorage cache first.
 * Falls back to OpenDataDE GitHub GeoJSON when not cached.
 * Cache key: @leadlens_zip_bounds_v5_{zip}
 */

import { storageBridge as AsyncStorage } from './storage';
import { fetchZipBoundary, fetchZipBoundariesBulk } from './territoryZipLoader';

const CACHE_KEY_PREFIX = '@leadlens_zip_bounds_v6_';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const ENABLE_GEOJSON_FETCH = false;

// OpenDataDE state zip GeoJSON files
const GEODATA_URLS = {
  TX: 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/tx_texas_zip_codes_geo.min.json',
  LA: 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/la_louisiana_zip_codes_geo.min.json',
  MA: 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/ma_massachusetts_zip_codes_geo.min.json',
};

// In-memory cache for fetched GeoJSON (avoids re-downloading per session)
const geoJsonCache = {};

function hasPolygonRings(bounds) {
  return Array.isArray(bounds?.allRings) && bounds.allRings.some((ring) => Array.isArray(ring) && ring.length >= 3);
}

async function persistBounds(key, zip, bounds) {
  if (!bounds?.center) return;
  const cacheData = JSON.stringify({
    savedAt: Date.now(),
    marker: {
      zip,
      latitude: bounds.center.latitude,
      longitude: bounds.center.longitude,
      allRings: bounds.allRings || [],
    },
  });
  AsyncStorage.setSync(key, cacheData);
  try {
    const RawStorage = require('@react-native-async-storage/async-storage').default;
    await RawStorage.setItem(key, cacheData);
  } catch (err) {
    console.warn('[ZipBoundaryCache] AsyncStorage write failed for key:', key, err?.message || String(err));
  }
}

/**
 * Get boundary data for a ZIP code.
 * Returns { center: {latitude, longitude}, allRings: [[coords]] } or null.
 */
export async function getZipBounds(zip) {
  if (!zip) return null;
  const cleanZip = String(zip).replace(/\D/g, '').slice(0, 5);
  if (cleanZip.length !== 5) return null;

  const key = `${CACHE_KEY_PREFIX}${cleanZip}`;
  let weakCachedBounds = null;

  // 1. Check MMKV sync (fastest)
  try {
    const syncRaw = AsyncStorage.getSync(key);
    if (syncRaw) {
      const parsed = JSON.parse(syncRaw);
      if (parsed?.savedAt && Date.now() - parsed.savedAt < CACHE_TTL) {
        const extracted = extractBounds(parsed.marker || parsed);
        if (hasPolygonRings(extracted)) return extracted;
        if (extracted) weakCachedBounds = extracted;
      }
    }
  } catch (err) {
    console.warn('[ZipBoundaryCache] MMKV read failed for key:', key, err?.message || String(err));
  }

  // 2. Check raw AsyncStorage
  try {
    const RawStorage = require('@react-native-async-storage/async-storage').default;
    const raw = await RawStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.savedAt && Date.now() - parsed.savedAt < CACHE_TTL) {
        const extracted = extractBounds(parsed.marker || parsed);
        if (hasPolygonRings(extracted)) return extracted;
        if (extracted && !weakCachedBounds) weakCachedBounds = extracted;
      }
    }
  } catch (err) {
    console.warn('[ZipBoundaryCache] AsyncStorage read failed for key:', key, err?.message || String(err));
  }

  // 3. Prefer precomputed per-ZIP boundaries from Supabase/bundled asset.
  try {
    const boundaryMarker = await fetchZipBoundary(cleanZip);
    const extracted = extractBounds(boundaryMarker);
    if (hasPolygonRings(extracted)) {
      await persistBounds(key, cleanZip, extracted);
      return extracted;
    }
    if (extracted && !weakCachedBounds) weakCachedBounds = extracted;
  } catch (err) {
    console.warn('[ZipBoundaryCache] Precomputed boundary lookup failed for', cleanZip, ':', err?.message || err);
  }

  // 4. Fetch from OpenDataDE GeoJSON
  const state = getStateForZip(cleanZip);
  const url = GEODATA_URLS[state];
  if (ENABLE_GEOJSON_FETCH && url) {
    try {
      const bounds = await fetchZipFromGeoJSON(cleanZip, state, url);
      if (bounds) {
        await persistBounds(key, cleanZip, bounds);
        return bounds;
      }
    } catch (err) {
      console.warn('[ZipBoundaryCache] GeoJSON fetch failed for', cleanZip, ':', err.message);
    }
  }

  if (weakCachedBounds) {
    return weakCachedBounds;
  }

  // 5. Fallback: Google Geocoding to get centroid — renders as circle on map
  try {
    const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
    const resp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${cleanZip}&key=${GOOGLE_KEY}`);
    const data = await resp.json();
    const loc = data.results?.[0]?.geometry?.location;
    if (loc && isFinite(loc.lat) && isFinite(loc.lng)) {
      console.log('[ZipBoundaryCache] Using Google geocoding fallback for', cleanZip);
      const bounds = { center: { latitude: loc.lat, longitude: loc.lng }, allRings: [] };
      await persistBounds(key, cleanZip, bounds);
      return bounds;
    }
  } catch (err) {
    console.warn('[ZipBoundaryCache] Google geocoding fallback failed for', cleanZip, ':', err.message);
  }

  return null;
}

/**
 * Determine state from ZIP prefix (covers TX, LA, MA beta regions)
 */
function getStateForZip(zip) {
  const prefix = parseInt(zip.slice(0, 3));
  // Texas: 733-733 (Amarillo area), 750-799 (main TX), 885 (El Paso)
  if ((prefix >= 750 && prefix <= 799) || (prefix >= 733 && prefix <= 733) || prefix === 885) return 'TX';
  // Louisiana: 700-714
  if (prefix >= 700 && prefix <= 714) return 'LA';
  // Massachusetts: 010-027
  if (prefix >= 10 && prefix <= 27) return 'MA';
  // Default to TX (primary beta market)
  return 'TX';
}

/**
 * Fetch and parse a specific ZIP from OpenDataDE GeoJSON
 */
async function fetchZipFromGeoJSON(zip, state, url) {
  // Use in-memory cache to avoid re-downloading the whole state file
  if (!geoJsonCache[state]) {
    console.log('[ZipBoundaryCache] Downloading GeoJSON for', state, '...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`GeoJSON fetch ${resp.status}`);
    geoJsonCache[state] = await resp.json();
    console.log('[ZipBoundaryCache] GeoJSON loaded for', state, ':', geoJsonCache[state]?.features?.length, 'features');
  }

  const geojson = geoJsonCache[state];
  const feature = geojson?.features?.find(f => {
    const props = f.properties || {};
    return props.ZCTA5CE10 === zip ||
      props.GEOID10 === zip ||
      String(props.zip) === zip ||
      String(props.ZIP) === zip ||
      String(props.ZIPCODE) === zip;
  });

  if (!feature) {
    console.warn('[ZipBoundaryCache] ZIP', zip, 'not found in', state, 'GeoJSON (', geojson?.features?.length, 'features)');
    // Log first feature's properties to help debug key names
    if (geojson?.features?.[0]) {
      console.log('[ZipBoundaryCache] Sample feature props:', JSON.stringify(geojson.features[0].properties));
    }
    return null;
  }
  console.log('[ZipBoundaryCache] Found ZIP', zip, 'in GeoJSON');

  const allRings = extractRingsFromFeature(feature);
  if (!allRings.length) return null;

  // Calculate centroid from all coordinates
  const allCoords = allRings.flat();
  const lat = allCoords.reduce((s, c) => s + c.latitude, 0) / allCoords.length;
  const lng = allCoords.reduce((s, c) => s + c.longitude, 0) / allCoords.length;

  return {
    center: { latitude: lat, longitude: lng },
    allRings,
  };
}

/**
 * Extract polygon rings from a GeoJSON feature
 */
function extractRingsFromFeature(feature) {
  const rings = [];
  const geom = feature.geometry;
  if (!geom) return rings;

  const processRing = (coords) => {
    const ring = coords
      .map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
      .filter(c => isFinite(c.latitude) && isFinite(c.longitude));
    if (ring.length >= 3) rings.push(ring);
  };

  if (geom.type === 'Polygon') {
    geom.coordinates.forEach(processRing);
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates.forEach(poly => poly.forEach(processRing));
  }

  return rings;
}

/**
 * Extract bounds from a cached marker object
 */
function extractBounds(marker) {
  if (!marker) return null;
  const lat = parseFloat(marker.latitude || marker.lat || marker.center?.latitude);
  const lng = parseFloat(marker.longitude || marker.lng || marker.center?.longitude);
  if (!isFinite(lat) || !isFinite(lng)) return null;

  const rawRings = marker.allRings || marker.polygons || marker.coordinates || [];
  const allRings = Array.isArray(rawRings) ? rawRings.map(ring => {
    if (!Array.isArray(ring)) return [];
    return ring.map(pt => {
      if (pt?.latitude !== undefined) return pt;
      if (pt?.lat !== undefined) return { latitude: pt.lat, longitude: pt.lng };
      if (Array.isArray(pt) && pt.length === 2) return { latitude: pt[1], longitude: pt[0] };
      return null;
    }).filter(Boolean);
  }).filter(r => r.length >= 3) : [];

  return { center: { latitude: lat, longitude: lng }, allRings };
}

export async function hasZipBounds(zip) {
  return (await getZipBounds(zip)) !== null;
}

export async function getBulkZipBounds(zips) {
  if (!Array.isArray(zips)) return {};

  const cleanZips = [...new Set(
    zips
      .map((zip) => String(zip || '').replace(/\D/g, '').slice(0, 5))
      .filter((zip) => zip.length === 5)
  )];

  console.log('[ZipBoundaryCache] getBulkZipBounds called for zips:', cleanZips);
  const bulkMarkers = await fetchZipBoundariesBulk(cleanZips).catch(() => ({}));
  const resolved = {};

  for (const zip of cleanZips) {
    const extracted = extractBounds(bulkMarkers?.[zip]);
    if (extracted) {
      resolved[zip] = extracted;
    }
  }

  const missing = cleanZips.filter((zip) => !resolved[zip]);
  console.log('[ZipBoundaryCache] getBulkZipBounds resolved:', Object.keys(resolved).length, '/', cleanZips.length, 'initial; missing:', missing);
  if (!missing.length) return resolved;

  const fallbackResults = await Promise.all(missing.map(async zip => [zip, await getZipBounds(zip)]));
  for (const [zip, bounds] of fallbackResults) {
    if (bounds) resolved[zip] = bounds;
  }

  console.log('[ZipBoundaryCache] getBulkZipBounds final resolved:', Object.keys(resolved).length, '/', cleanZips.length);
  return resolved;
}
