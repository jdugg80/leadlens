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

const CACHE_KEY_PREFIX = '@leadlens_zip_bounds_v5_';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

/**
 * Get Supabase client
 */
async function getSupabaseClient() {
  try {
    console.log('[DEBUG] Attempting to create Supabase client...');
    console.log('[DEBUG] EXPO_PUBLIC_SUPABASE_URL:', process.env.EXPO_PUBLIC_SUPABASE_URL);
    console.log('[DEBUG] EXPO_PUBLIC_SUPABASE_ANON_KEY:', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...');
    
    const client = createSupabaseClient();
    console.log('[DEBUG] Client created:', !!client);
    return client;
  } catch (error) {
    console.log('[DEBUG] Error creating client:', error?.message);
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
  if (!supabase) return null;

  try {
    const { data } = await supabase
      .from('zip_boundaries')
      .select('polygon,all_rings,coords')
      .eq('zip_code', zip)
      .single();

    if (!data) return null;

    const marker = {
      zip,
      polygon: data.polygon,
      allRings: data.all_rings,
      coords: data.coords,
    };

    if (__DEV__) console.log('[TerritoryZipLoader] Supabase cache hit:', zip);
    return marker;
  } catch {
    return null;
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

  // 1. Try Supabase cache first
  const supabase = await getSupabaseClient();
  if (supabase) {
    const cached = await getCachedBoundaryFromSupabase(cleanZip, supabase);
    if (cached) return cached;
  }

  // 2. Try MMKV cache
  const mmkvCached = await getCachedBoundary(cleanZip);
  if (mmkvCached) return mmkvCached;

  // 3. No cache - return null (will render fallback circle)
  if (__DEV__) console.log('[TerritoryZipLoader] No cache for ZIP:', cleanZip);
  return null;
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
  const zips = uniqueZips(supabaseZips);

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

  if (__DEV__) console.log('[TerritoryZipLoader] ZIP markers built:', { count: markers.length, fallbacks: markers.filter(m => m.isFallback).length });

  return markers;
}

// Export fetchZipBoundary as named export
export { fetchZipBoundary };

export default {
  fetchZipBoundary,
  loadTerritoryZipMarkersFallback,
};