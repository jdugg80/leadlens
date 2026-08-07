// src/utils/territoryZipLoader.js
// LeadLens territory ZIP loader with CACHE-ONLY mode (skip Nominatim)
//
// Key enhancement: Load ZIP boundaries from cache only.
// No Nominatim API calls - avoids rate limiting.
// 
// Cache Priority:
// 1. Supabase (persistent, fastest)
// 2. MMKV via storageBridge (offline, very fast)
// 3. Fallback circle polygon (if no cache)
const { createSupabaseClient } = require('./supabaseClient.js');

let storageBridge = null;

try {
  storageBridge = require('./storage').storageBridge;
} catch (error) {
  console.log('[TerritoryZipLoader] Storage bridge import failed:', error?.message);
  storageBridge = null;
}

const CACHE_KEY_PREFIX = '@leadlens_zip_bounds_v6_';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
let bundledZipBoundaries = null;

const SUPABASE_REST_URL = String(process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

// Rate limit queue for Nominatim (NOT USED - cache only)
let nominatimQueue = [];
let lastNominatimFetch = 0;
console.log('[TerritoryZipLoader] Module loaded, about to define candidates...');
const TERRITORY_TABLE_CANDIDATES = [
  'territory_zips',
  'user_territories',
  'assigned_territories',
  'my_territories',
];

/**
 * Normalize ZIP code
 */
function normalizeZip(zip) {
  if (!zip) return null;
  const cleaned = String(zip).replace(/\D/g, '').slice(0, 5);
  return cleaned.length === 5 ? cleaned : null;
}

/**
 * Get unique ZIPs from array
 */
function uniqueZips(zips) {
  return [...new Set(zips.filter(Boolean).map(z => normalizeZip(z)).filter(Boolean))];
}

function toCoordinate(point) {
  if (Array.isArray(point) && point.length >= 2) {
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (isFinite(lat) && isFinite(lng)) return { latitude: lat, longitude: lng };
  }
  if (point?.latitude !== undefined && point?.longitude !== undefined) {
    const lat = Number(point.latitude);
    const lng = Number(point.longitude);
    if (isFinite(lat) && isFinite(lng)) return { latitude: lat, longitude: lng };
  }
  if (point?.lat !== undefined && point?.lng !== undefined) {
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (isFinite(lat) && isFinite(lng)) return { latitude: lat, longitude: lng };
  }
  return null;
}

function normalizeRings(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const first = raw[0];
  const looksLikeSingleRing =
    (Array.isArray(first) && typeof first[0] === 'number')
    || first?.latitude !== undefined
    || first?.lat !== undefined;

  const rings = looksLikeSingleRing ? [raw] : raw;

  return rings
    .map((ring) => {
      if (!Array.isArray(ring)) return [];
      return ring.map(toCoordinate).filter(Boolean);
    })
    .filter((ring) => ring.length >= 3);
}

function computeCenterFromRings(allRings) {
  const points = Array.isArray(allRings) ? allRings.flat() : [];
  if (!points.length) return null;
  const latitude = points.reduce((sum, p) => sum + Number(p.latitude || 0), 0) / points.length;
  const longitude = points.reduce((sum, p) => sum + Number(p.longitude || 0), 0) / points.length;
  if (!isFinite(latitude) || !isFinite(longitude)) return null;
  return { latitude, longitude };
}

function buildBoundaryMarker(zip, rawBoundary) {
  if (!rawBoundary) return null;

  const allRings = normalizeRings(
    rawBoundary?.allRings
    || rawBoundary?.all_rings
    || rawBoundary?.polygon
    || rawBoundary
  );

  const coords =
    toCoordinate(rawBoundary?.coords)
    || toCoordinate(rawBoundary?.center)
    || computeCenterFromRings(allRings);

  if (!coords) return null;

  return {
    zip,
    polygon: allRings[0] || null,
    allRings,
    coords,
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
}

function hasBoundaryRings(marker) {
  return Array.isArray(marker?.allRings) && marker.allRings.some((ring) => Array.isArray(ring) && ring.length >= 3);
}

async function saveBoundaryToCache(zip, marker) {
  if (!marker) return;
  const cacheData = JSON.stringify({
    savedAt: Date.now(),
    marker: {
      zip,
      latitude: marker.coords?.latitude ?? marker.latitude,
      longitude: marker.coords?.longitude ?? marker.longitude,
      allRings: marker.allRings || [],
    },
  });

  try {
    if (typeof storageBridge?.setSync === 'function') storageBridge.setSync(`${CACHE_KEY_PREFIX}${zip}`, cacheData);
    else if (typeof storageBridge?.setItem === 'function') await storageBridge.setItem(`${CACHE_KEY_PREFIX}${zip}`, cacheData);
  } catch (err) {
    console.warn('[TerritoryZipLoader] MMKV write failed for zip:', zip, err?.message || String(err));
  }

  try {
    const RawStorage = require('@react-native-async-storage/async-storage').default;
    await RawStorage.setItem(`${CACHE_KEY_PREFIX}${zip}`, cacheData);
  } catch (err) {
    console.warn('[TerritoryZipLoader] AsyncStorage write failed for zip:', zip, err?.message || String(err));
  }
}

function getBundledBoundaryRaw(zip) {
  try {
    if (!bundledZipBoundaries) {
      bundledZipBoundaries = require('../../assets/zip_boundaries.json');
    }
    if (Array.isArray(bundledZipBoundaries)) {
      return bundledZipBoundaries.find((entry) => normalizeZip(entry?.zip || entry?.ZIP) === zip) || null;
    }
    return bundledZipBoundaries?.[zip] || null;
  } catch (error) {
    console.warn('[TerritoryZipLoader] Bundled ZIP boundaries unavailable:', error?.message || error);
    return null;
  }
}

/**
 * Get Supabase client
 */
async function getSupabaseClient() {
  try {
    return createSupabaseClient();
  } catch {
    return null;
  }
}

/**
 * Get current authenticated user ID
 */
async function getCurrentUserId(supabaseClient) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.user?.id || null;
  } catch {
    return null;
  }
}
async function queryTableForZips(supabaseClient, tableName, userId) {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const userEmail = session?.user?.email;
    
    console.log('[queryTableForZips] User email:', userEmail);
    
    if (!userEmail) {
      console.log('[queryTableForZips] No email found!');
      return [];
    }

    // Query profiles table to get rep_name by email
    const { data: profileData, error: profileError } = await supabaseClient
      .from('profiles')
      .select('rep_name')
      .eq('email', userEmail)
      .single();
    
    console.log('[queryTableForZips] Profile lookup result:', { profileData, profileError });
    
    const repName = profileData?.rep_name;
    if (!repName) {
      console.log('[queryTableForZips] No rep_name found for email:', userEmail);
      return [];
    }

    console.log('[queryTableForZips] Found rep_name:', repName, '- querying', tableName);

    // Query territory_zips by rep_name
    const { data, error } = await supabaseClient
      .from(tableName)
      .select('zip')
      .eq('rep_name', repName)
      .limit(100);

    console.log('[queryTableForZips] Territory query result:', { dataCount: data?.length, error });

    if (!Array.isArray(data)) return [];
    const zips = [];
    for (const row of data) {
      if (row.zip) zips.push(row.zip);
      if (row.zips) {
        if (Array.isArray(row.zips)) zips.push(...row.zips);
        else if (typeof row.zips === 'string') zips.push(...row.zips.split(','));
      }
      if (row.zip) zips.push(row.zip);
    }
    return zips;
  } catch (error) {
    console.log('[queryTableForZips] Error:', error?.message);
    return [];
  }
}

/**
 * Get ZIPs from Supabase
 */
async function getZipsFromSupabase(supabaseClient) {
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    console.log('[TerritoryZipLoader] Supabase client unavailable.');
    return [];
  }

  const userId = await getCurrentUserId(supabaseClient);

  if (__DEV__) console.log('[TerritoryZipLoader] Supabase client connected:', { hasUserId: Boolean(userId) });

  const allZips = [];

  for (const table of TERRITORY_TABLE_CANDIDATES) {
    const tableZips = await queryTableForZips(supabaseClient, table, userId);
    allZips.push(...tableZips);
  }

  return uniqueZips(allZips);
}

/**
 * Get cached boundary from MMKV
 */
async function getCachedBoundary(zip) {
  if (!storageBridge) return null;

  try {
    const raw = await storageBridge.getItem(`${CACHE_KEY_PREFIX}${zip}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      return null;
    }

    if (!parsed.marker?.zip || !Array.isArray(parsed.marker?.allRings)) {
      return null;
    }

    if (__DEV__) console.log('[TerritoryZipLoader] MMKV cache hit:', zip);
    return parsed.marker;
  } catch {
    return null;
  }
}

/**
 * Get cached boundary from Supabase
 */
async function getCachedBoundaryFromSupabase(zip, supabase) {
  try {
    let data = null;

    if (SUPABASE_REST_URL && SUPABASE_ANON_KEY) {
      const response = await fetch(
        `${SUPABASE_REST_URL}/rest/v1/zip_boundaries?select=zip_code,polygon,all_rings,coords&zip_code=eq.${zip}`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (response.ok) {
        const rows = await response.json();
        data = Array.isArray(rows) ? (rows[0] || null) : null;
      }
    }

    if (!data && supabase) {
      const alt = await supabase
        .from('zip_boundaries')
        .select('zip_code,polygon,all_rings,coords')
        .eq('zip_code', zip)
        .maybeSingle()
        .catch(() => ({ data: null }));
      data = alt?.data || null;
    }

    if (!data) return null;

    const marker = buildBoundaryMarker(zip, data);
    if (!marker) return null;

    await saveBoundaryToCache(zip, marker);

    if (__DEV__) console.log('[TerritoryZipLoader] Supabase cache hit:', zip);
    return marker;
  } catch {
    return null;
  }
}

async function getCachedBoundariesFromSupabaseBulk(zips, supabase) {
  const cleanZips = uniqueZips(zips);
  if (!cleanZips.length) return {};

  console.log('[TerritoryZipLoader] getCachedBoundariesFromSupabaseBulk querying zip_boundaries for zips:', cleanZips);

  const rowsToMarkers = async (rows) => {
    const result = {};
    for (const row of (rows || [])) {
      const zip = normalizeZip(row?.zip || row?.zip_code);
      if (!zip) continue;
      const marker = buildBoundaryMarker(zip, row);
      if (!marker) continue;
      result[zip] = marker;
      await saveBoundaryToCache(zip, marker);
    }
    return result;
  };

  // NOTE: zip_boundaries is a pure geographic table. It has no territory_type
  // column, so the query cannot (and does not need to) filter by residential/commercial.
  // If territory-specific boundary variants are added in the future, add the
  // territory_type filter here and in the SDK query below.
  if (SUPABASE_REST_URL && SUPABASE_ANON_KEY) {
    try {
      const response = await fetch(
        `${SUPABASE_REST_URL}/rest/v1/zip_boundaries?select=zip_code,polygon,all_rings,coords&zip_code=in.(${cleanZips.join(',')})`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const result = await rowsToMarkers(data);
        const hitCount = Object.keys(result).length;
        console.log('[TerritoryZipLoader] Supabase REST boundary hits:', hitCount, '/', cleanZips.length);
        if (hitCount !== cleanZips.length) {
          console.log('[TerritoryZipLoader] Supabase REST missing zips:', cleanZips.filter((zip) => !result[zip]).join(','));
        }
        if (hitCount > 0) return result;
      } else {
        console.warn('[TerritoryZipLoader] Supabase REST boundary fetch failed:', response.status);
      }
    } catch (err) {
      console.warn('[TerritoryZipLoader] Supabase REST boundary fetch error:', err?.message);
    }
  }

  if (!supabase) return {};

  try {
    const { data } = await supabase
      .from('zip_boundaries')
      .select('zip_code,polygon,all_rings,coords')
      .in('zip_code', cleanZips);

    const result = await rowsToMarkers(data);
    console.log('[TerritoryZipLoader] Supabase SDK boundary hits:', Object.keys(result).length, '/', cleanZips.length);
    return result;
  } catch (err) {
    console.warn('[TerritoryZipLoader] Supabase SDK boundary fetch error:', err?.message);
    return {};
  }
}

/**
 * Create fallback circle polygon (2.5 mile radius)
 */
function createFallbackCircle(zip) {
  // Fallback: return undefined to use map's default circle
  // The calling code will handle circle rendering
  return null;
}

/**
 * Fetch ZIP boundary (CACHE ONLY - no Nominatim)
 */
async function fetchZipBoundary(zip) {
  const cleanZip = normalizeZip(zip);
  if (!cleanZip) return null;
  const bulk = await fetchZipBoundariesBulk([cleanZip]);
  return bulk[cleanZip] || null;
}

export async function fetchZipBoundariesBulk(zips, { supabaseClient } = {}) {
  const cleanZips = uniqueZips(zips);
  console.log('[TerritoryZipLoader] fetchZipBoundariesBulk called for zips:', cleanZips);
  if (!cleanZips.length) return {};

  if (!supabaseClient) {
    supabaseClient = await getSupabaseClient();
  }

  const supabaseBoundaries = await getCachedBoundariesFromSupabaseBulk(cleanZips, supabaseClient).catch(() => ({}));
  const results = { ...supabaseBoundaries };

  for (const zip of cleanZips) {
    if (results[zip]) continue;

    const mmkvCached = await getCachedBoundary(zip);
    if (hasBoundaryRings(mmkvCached)) {
      results[zip] = mmkvCached;
      console.log('[TerritoryZipLoader] MMKV cache hit with rings for', zip);
      continue;
    }

    const bundledMarker = buildBoundaryMarker(zip, getBundledBoundaryRaw(zip));
    if (bundledMarker) {
      await saveBoundaryToCache(zip, bundledMarker);
      results[zip] = bundledMarker;
      console.log('[TerritoryZipLoader] Bundled boundary used for', zip);
      continue;
    }

    if (mmkvCached) {
      results[zip] = mmkvCached;
      console.log('[TerritoryZipLoader] MMKV cache hit without rings for', zip);
    }
  }

  console.log('[TerritoryZipLoader] fetchZipBoundariesBulk resolved:', Object.keys(results).length, '/', cleanZips.length, 'zips have boundaries');
  return results;
}

/**
 * Public function: Load territory ZIP markers from cache only
 */
export async function loadTerritoryZipMarkersFallback({ supabaseClient } = {}) {
  if (!supabaseClient) {
    supabaseClient = await getSupabaseClient();
  }
  console.log('[loadTerritoryZipMarkersFallback] Function called with supabaseClient:', !!supabaseClient);
  if (__DEV__) console.log('[TerritoryZipLoader] Territory ZIP loader started (CACHE ONLY).');

  const supabaseZips = await getZipsFromSupabase(supabaseClient);
  let zips = uniqueZips(supabaseZips);

  // Fallback: read territory zips from local storageBridge if Supabase returned nothing
  if (zips.length === 0 && storageBridge) {
    try {
      const localRaw = await storageBridge.getItem('leadlens_territory_zips');
      if (localRaw) {
        const localEntries = JSON.parse(localRaw);
        const localZips = Array.isArray(localEntries)
          ? localEntries.map(e => (typeof e === 'string' ? e : e?.zip)).filter(Boolean)
          : [];
        zips = uniqueZips(localZips);
        if (zips.length > 0) {
          console.log('[TerritoryZipLoader] Loaded', zips.length, 'ZIPs from local storage fallback.');
        }
      }
    } catch (localErr) {
      console.warn('[TerritoryZipLoader] Local storage fallback failed:', localErr?.message);
    }
  }

  if (__DEV__) console.log('[TerritoryZipLoader] ZIP candidates found:', { count: zips.length });

  if (zips.length === 0) {
    console.log('[TerritoryZipLoader] No territory ZIPs found.');
    return [];
  }

  const markers = [];

  for (const zip of zips) {
    const marker = await fetchZipBoundary(zip);
    if (marker) {
      markers.push(marker);
    } else {
      // Return fallback circle marker
      markers.push({
        zip,
        isFallback: true,
      });
    }
  }

  console.log('[ZipLoader] Loaded', markers.length, 'territory ZIP markers');
  if (markers.length > 0) {
    console.log('[ZipLoader] Sample:', JSON.stringify(markers[0]).slice(0, 200));
  }

  return markers;
}

// Export fetchZipBoundary as named export
export { fetchZipBoundary };

export default {
  fetchZipBoundary,
  fetchZipBoundariesBulk,
  loadTerritoryZipMarkersFallback,
};
