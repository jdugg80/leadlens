// src/utils/territoryZipLoader.js
// LeadLens production-leaning territory ZIP loader.
//
// Purpose:
// - Use the real Supabase client when available.
// - Pull assigned territory ZIPs from Supabase.
// - Fall back to AsyncStorage only when needed.
// - Cache ZIP boundary markers so the app is not fetching boundaries every map open.
// - Return markers shaped for TerritoryMapScreen:
//
// {
//   zip,
//   coords,
//   polygon,
//   allRings,
//   colors,
//   level,
//   source
// }

let AsyncStorage = null;

try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch (error) {
  AsyncStorage = null;
}

const CACHE_KEY_PREFIX = 'leadlens:territoryZipBoundary:';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const DEFAULT_ZIP_COLORS = {
  text: '#8B5CF6',
  stroke: '#8B5CF6',
  fill: 'rgba(124, 58, 237, 0.18)',
  glow: 'rgba(124, 58, 237, 0.32)',
  bg: 'rgba(124, 58, 237, 0.12)',
};

const TERRITORY_TABLE_CANDIDATES = [
  'territory_zips',
  'territory_zip_codes',
  'user_territory_zips',
  'assigned_zips',
  'zip_codes',
  'territories',
];

function normalizeZip(value) {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\b\d{5}\b/);
  return match ? match[0] : null;
}

function uniqueZips(values) {
  return Array.from(new Set(values.map(normalizeZip).filter(Boolean))).sort();
}

function collectZipsDeep(value, found = new Set(), depth = 0) {
  if (depth > 5 || value === null || value === undefined) return found;

  if (typeof value === 'string' || typeof value === 'number') {
    const matches = String(value).match(/\b\d{5}\b/g);
    if (matches) matches.forEach((zip) => found.add(zip));
    return found;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectZipsDeep(item, found, depth + 1));
    return found;
  }

  if (typeof value === 'object') {
    const likelyZipFields = [
      'zip',
      'zip_code',
      'zipcode',
      'postal_code',
      'postalCode',
      'territory_zip',
      'territoryZip',
      'zips',
      'zipCodes',
      'zip_codes',
      'assigned_zips',
      'assignedZips',
    ];

    for (const field of likelyZipFields) {
      if (Object.prototype.hasOwnProperty.call(value, field)) {
        collectZipsDeep(value[field], found, depth + 1);
      }
    }

    if (depth <= 1) {
      Object.values(value).forEach((item) => collectZipsDeep(item, found, depth + 1));
    }
  }

  return found;
}

async function getCurrentUserId(supabaseClient) {
  if (!supabaseClient?.auth?.getUser) return null;

  try {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) {
      console.log('[TerritoryZipLoader] auth.getUser error:', error.message);
      return null;
    }

    return data?.user?.id || null;
  } catch (error) {
    console.log('[TerritoryZipLoader] auth.getUser failed:', error?.message || String(error));
    return null;
  }
}

async function queryTableForZips(supabaseClient, table, userId) {
  // Try broad query first. RLS should restrict rows if policies are configured.
  // If it fails, we just skip that candidate table.
  try {
    // Explicitly filter by user_id when available — bypasses RLS ambiguity
    let query = supabaseClient.from(table).select('*').limit(1000);
    if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;

    if (error) {
      console.log('[TerritoryZipLoader] Table skipped:', {
        table,
        message: error.message,
      });
      return [];
    }

    if (__DEV__) console.log('[TerritoryZipLoader] Table result:', {
      table,
      count: Array.isArray(data) ? data.length : 0,
      sample: Array.isArray(data) ? data[0] : data,
    });

    // Only extract from known zip fields — never deep-scan all fields
    // since collectZipsDeep would find 5-digit patterns in UUIDs, timestamps etc.
    const found = new Set();
    if (Array.isArray(data)) {
      for (const row of data) {
        const zipFields = ['zip', 'zip_code', 'zipcode', 'postal_code', 'postalCode'];
        for (const field of zipFields) {
          if (row[field]) {
            const z = normalizeZip(row[field]);
            if (z) found.add(z);
          }
        }
      }
    }
    return Array.from(found);
  } catch (error) {
    console.log('[TerritoryZipLoader] Table query failed:', {
      table,
      message: error?.message || String(error),
    });
    return [];
  }
}

async function getZipsFromSupabase(supabaseClient) {
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    console.log('[TerritoryZipLoader] Supabase client unavailable. Using AsyncStorage fallback only.');
    return [];
  }

  const userId = await getCurrentUserId(supabaseClient);

  if (__DEV__) console.log('[TerritoryZipLoader] Supabase client connected:', {
    hasUserId: Boolean(userId),
    userId,
  });

  const allZips = [];

  for (const table of TERRITORY_TABLE_CANDIDATES) {
    const tableZips = await queryTableForZips(supabaseClient, table, userId);
    allZips.push(...tableZips);
  }

  return uniqueZips(allZips);
}

async function getZipsFromAsyncStorage() {
  if (!AsyncStorage) return [];

  const found = new Set();

  // AsyncStorage is used ONLY as a boundary polygon cache, not as a zip source.
  // Supabase is the authoritative source for territory zips.
  // Returning empty here prevents stale/incorrect zip lists from polluting the map.
  return [];
}

function coordinatePairToLatLng(pair) {
  if (!Array.isArray(pair) || pair.length < 2) return null;

  const longitude = Number(pair[0]);
  const latitude = Number(pair[1]);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function geoJsonToRings(geojson) {
  if (!geojson || !geojson.type || !Array.isArray(geojson.coordinates)) return [];

  if (geojson.type === 'Polygon') {
    return geojson.coordinates
      .map((ring) => ring.map(coordinatePairToLatLng).filter(Boolean))
      .filter((ring) => ring.length >= 3);
  }

  if (geojson.type === 'MultiPolygon') {
    return geojson.coordinates
      .flatMap((polygon) =>
        polygon.map((ring) => ring.map(coordinatePairToLatLng).filter(Boolean))
      )
      .filter((ring) => ring.length >= 3);
  }

  return [];
}

function makeCircleFallbackPolygon(center, radiusMiles = 2.5, sides = 36) {
  const latitude = Number(center?.latitude);
  const longitude = Number(center?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

  const radiusLat = radiusMiles / 69;
  const radiusLng = radiusMiles / (69 * Math.cos((latitude * Math.PI) / 180));

  return Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;

    return {
      latitude: latitude + Math.sin(angle) * radiusLat,
      longitude: longitude + Math.cos(angle) * radiusLng,
    };
  });
}

function getCentroidFromRing(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return null;

  const total = ring.reduce(
    (sum, point) => ({
      latitude: sum.latitude + Number(point.latitude || 0),
      longitude: sum.longitude + Number(point.longitude || 0),
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: total.latitude / ring.length,
    longitude: total.longitude / ring.length,
  };
}

async function getCachedBoundary(zip) {
  if (!AsyncStorage) return null;

  try {
    const raw = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}${zip}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) {
      return null;
    }

    if (!parsed.marker?.zip || !Array.isArray(parsed.marker?.allRings)) {
      return null;
    }

    if (__DEV__) console.log('[TerritoryZipLoader] Boundary cache hit:', zip);
    return parsed.marker;
  } catch {
    return null;
  }
}

async function setCachedBoundary(zip, marker) {
  if (!AsyncStorage || !marker) return;

  try {
    await AsyncStorage.setItem(
      `${CACHE_KEY_PREFIX}${zip}`,
      JSON.stringify({
        savedAt: Date.now(),
        marker,
      })
    );
  } catch (error) {
    console.log('[TerritoryZipLoader] Boundary cache save failed:', {
      zip,
      message: error?.message || String(error),
    });
  }
}

async function fetchZipBoundary(zip) {
  const cleanZip = normalizeZip(zip);
  if (!cleanZip) return null;

  const cached = await getCachedBoundary(cleanZip);
  if (cached) return cached;

  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `postalcode=${encodeURIComponent(cleanZip)}` +
    `&country=USA&countrycodes=us&format=json&polygon_geojson=1&limit=1`;

  try {
    if (__DEV__) console.log('[TerritoryZipLoader] Fetching boundary:', cleanZip);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LeadLens Territory Map',
      },
    });

    if (!response.ok) {
      console.log('[TerritoryZipLoader] Boundary fetch failed:', {
        zip: cleanZip,
        status: response.status,
      });
      return null;
    }

    const result = await response.json();
    const first = Array.isArray(result) ? result[0] : null;

    if (!first) {
      console.log('[TerritoryZipLoader] No boundary result:', cleanZip);
      return null;
    }

    let allRings = geoJsonToRings(first.geojson);

    const center = {
      latitude: Number(first.lat),
      longitude: Number(first.lon),
    };

    if (allRings.length === 0 && Number.isFinite(center.latitude) && Number.isFinite(center.longitude)) {
      console.log('[TerritoryZipLoader] Using fallback circle polygon:', cleanZip);
      allRings = [makeCircleFallbackPolygon(center)];
    }

    if (!Array.isArray(allRings) || allRings.length === 0) return null;

    const marker = {
      zip: cleanZip,
      coords: getCentroidFromRing(allRings[0]) || center,
      polygon: allRings[0],
      allRings,
      colors: DEFAULT_ZIP_COLORS,
      level: 1,
      source: 'territoryZipLoader',
    };

    await setCachedBoundary(cleanZip, marker);

    return marker;
  } catch (error) {
    console.log('[TerritoryZipLoader] Boundary fetch error:', {
      zip: cleanZip,
      message: error?.message || String(error),
    });
    return null;
  }
}

export async function loadTerritoryZipMarkersFallback({ supabaseClient } = {}) {
  if (__DEV__) console.log('[TerritoryZipLoader] Territory ZIP loader started.');

  const supabaseZips = await getZipsFromSupabase(supabaseClient);
  const storageZips = await getZipsFromAsyncStorage();

  const zips = uniqueZips([...supabaseZips, ...storageZips]);

  if (__DEV__) console.log('[TerritoryZipLoader] ZIP candidates found:', {
    count: zips.length,
    zips,
  });

  if (zips.length === 0) {
    console.log('[TerritoryZipLoader] No territory ZIPs found from Supabase or AsyncStorage.');
    return [];
  }

  const markers = [];

  for (const zip of zips) {
    const marker = await fetchZipBoundary(zip);
    if (marker) markers.push(marker);
  }

  if (__DEV__) console.log('[TerritoryZipLoader] ZIP markers built:', {
    count: markers.length,
    sample: markers[0],
  });

  return markers;
}
