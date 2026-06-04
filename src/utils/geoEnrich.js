import * as Location from 'expo-location';

const REVERSE_GEOCODE_CACHE_TTL_MS = 10 * 60 * 1000;
const REVERSE_GEOCODE_MIN_INTERVAL_MS = 1500;
const REVERSE_GEOCODE_429_BACKOFF_MS = 60 * 1000;

const reverseGeocodeCache = new Map();
let reverseGeocodeLastRequestAt = 0;
let reverseGeocodeBackoffUntil = 0;

function reverseGeoCacheKey(coords) {
  const lat = Number(coords?.latitude || 0).toFixed(4);
  const lon = Number(coords?.longitude || 0).toFixed(4);
  return `${lat},${lon}`;
}

function haversineMeters(a, b) {
  if (!a?.latitude || !a?.longitude || !b?.latitude || !b?.longitude) return null;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Gets the current device coordinates with multiple fallback attempts.
 * High accuracy is tried first, then balanced, to avoid indefinite hangs indoors.
 */
export async function getCurrentCoords() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // Attempt 1: Balanced accuracy (faster, works better indoors)
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (loc?.coords) {
        return {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? null,
          altitude: loc.coords.altitude ?? null,
          heading: loc.coords.heading ?? null,
          speed: loc.coords.speed ?? null,
        };
      }
    } catch (e) {
      console.log('[GeoEnrich] Balanced accuracy failed, trying last known...');
    }

    // Attempt 2: Last known location (near instant)
    const lastLoc = await Location.getLastKnownPositionAsync();
    if (lastLoc?.coords) {
       return {
          latitude: lastLoc.coords.latitude,
          longitude: lastLoc.coords.longitude,
          accuracy: lastLoc.coords.accuracy ?? null,
       };
    }

    return null;
  } catch (err) {
    console.warn('[GeoEnrich] Failed to get coordinates:', err);
    return null;
  }
}

export async function reverseGeocodeCoords(coords) {
  if (!coords?.latitude || !coords?.longitude) return null;

  const key = reverseGeoCacheKey(coords);
  const now = Date.now();
  const cached = reverseGeocodeCache.get(key);
  if (cached && now - cached.savedAt < REVERSE_GEOCODE_CACHE_TTL_MS) {
    return cached.value;
  }

  if (now < reverseGeocodeBackoffUntil) {
    return cached?.value || null;
  }

  if (now - reverseGeocodeLastRequestAt < REVERSE_GEOCODE_MIN_INTERVAL_MS) {
    return cached?.value || null;
  }

  reverseGeocodeLastRequestAt = now;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1`;
    console.log('[GeoEnrich] reverseGeocodeCoords calling:', url);
    const resp = await fetch(url, { headers: { 'User-Agent': 'LeadLens/1.12 (storefront-scan)' } });
    console.log('[GeoEnrich] reverseGeocodeCoords response status:', resp.status);
    if (!resp.ok) {
      console.warn('[GeoEnrich] reverseGeocodeCoords HTTP error:', resp.status);
      if (resp.status === 429) {
        reverseGeocodeBackoffUntil = Date.now() + REVERSE_GEOCODE_429_BACKOFF_MS;
      }
      return cached?.value || null;
    }
    const result = await resp.json();
    console.log('[GeoEnrich] reverseGeocodeCoords result:', result);
    const parsed = parseNominatimResult(result);
    console.log('[GeoEnrich] reverseGeocodeCoords parsed:', parsed);
    const resolved = {
      ...parsed,
      latitude: coords.latitude,
      longitude: coords.longitude,
      _geoSource: 'OpenStreetMap reverse geocode',
      _geoDisplayName: result?.display_name || '',
      _matchConfidence: 'medium',
      _distanceMeters: 0,
    };
    reverseGeocodeCache.set(key, { value: resolved, savedAt: Date.now() });
    reverseGeocodeBackoffUntil = 0;
    return resolved;
  } catch (err) {
    console.error('[GeoEnrich] reverseGeocodeCoords error:', err);
    return cached?.value || null;
  }
}

export async function geocodeBusinessNearby(businessName, coords) {
  if (!businessName || !coords) return null;

  try {
    const { latitude: lat, longitude: lng } = coords;
    for (const delta of [0.008, 0.02, 0.045]) {
      const viewbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
      const url = `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(businessName)}&format=jsonv2&addressdetails=1&limit=6&viewbox=${viewbox}&bounded=1`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'LeadLens/1.12 (storefront-scan)' } });
      if (!resp.ok) continue;
      const results = await resp.json();
      if (results?.length) {
        const ranked = results.map((item) => {
          const parsed = parseNominatimResult(item);
          const latitude = Number(item.lat);
          const longitude = Number(item.lon);
          const distance = haversineMeters(coords, { latitude, longitude });
          return {
            ...parsed,
            latitude,
            longitude,
            _distanceMeters: distance,
            _geoSource: 'OpenStreetMap nearby match',
            _geoDisplayName: item.display_name || '',
            _matchConfidence: distance !== null && distance <= 120 ? 'high' : distance !== null && distance <= 350 ? 'medium' : 'low',
          };
        }).sort((a, b) => (a._distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b._distanceMeters ?? Number.MAX_SAFE_INTEGER));
        return ranked[0];
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseNominatimResult(result) {
  if (!result?.address) return null;
  const a = result.address;
  const houseNumber = a.house_number || '';
  const road = a.road || a.pedestrian || a.street || '';
  const city = a.city || a.town || a.village || a.suburb || '';
  const county = a.county || '';
  const state = a.state || a.state_code || '';
  const postcode = a.postcode || '';

  return {
    streetNumber: houseNumber,
    streetName: road,
    city: city || county, // fallback to county if city is null for general area matching
    county: county.replace(' County', '').trim(),
    state: abbreviateState(state),
    zip: postcode,
    addressLine2: '',
  };
}

const STATE_MAP = {
  Alabama:'AL',Alaska:'AK',Arizona:'AZ',Arkansas:'AR',California:'CA',Colorado:'CO',Connecticut:'CT',Delaware:'DE',Florida:'FL',Georgia:'GA',Hawaii:'HI',Idaho:'ID',Illinois:'IL',Indiana:'IN',Iowa:'IA',Kansas:'KS',Kentucky:'KY',Louisiana:'LA',Maine:'ME',Maryland:'MD',Massachusetts:'MA',Michigan:'MI',Minnesota:'MN',Mississippi:'MS',Missouri:'MO',Montana:'MT',Nebraska:'NE',Nevada:'NV', 'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',Ohio:'OH',Oklahoma:'OK',Oregon:'OR',Pennsylvania:'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD',Tennessee:'TN',Texas:'TX',Utah:'UT',Vermont:'VT',Virginia:'VA',Washington:'WA','West Virginia':'WV',Wisconsin:'WI',Wyoming:'WY'
};

function abbreviateState(state) {
  if (!state) return '';
  if (state.length === 2) return state.toUpperCase();
  return STATE_MAP[state] || String(state).slice(0, 2).toUpperCase();
}

// ─── GeoTarget Assist ─────────────────────────────────────────────────────────

export async function getCameraHeading() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const heading = await Location.getHeadingAsync();
    return {
      magHeading: heading.magHeading,
      trueHeading: heading.trueHeading,
      accuracy: heading.accuracy,
    };
  } catch {
    return null;
  }
}

export function estimateTargetDistance(zoomLevel = 1) {
  // Rough distance estimate based on zoom
  // zoom 1 = normal = ~10-30m, zoom 2x = ~30-80m, zoom 3x+ = ~80-300m
  if (zoomLevel <= 1) return { min: 5, max: 30, label: 'Close range' };
  if (zoomLevel <= 2) return { min: 30, max: 80, label: 'Medium range' };
  return { min: 80, max: 300, label: 'Far range' };
}

export function calculateGeoTargetConfidence({
  hasGps,
  hasHeading,
  hasOcrBusinessName,
  hasOcrAddress,
  hasNearbyMatch,
  nearbyMatchConfidence,
  distanceMeters,
}) {
  let score = 0;
  const factors = [];

  if (hasGps) { score += 25; factors.push('GPS'); }
  if (hasHeading) { score += 10; factors.push('Camera direction'); }
  if (hasOcrBusinessName) { score += 20; factors.push('Business name detected'); }
  if (hasOcrAddress) { score += 15; factors.push('Address detected'); }

  if (hasNearbyMatch) {
    if (nearbyMatchConfidence === 'high') { score += 30; factors.push('Nearby match confirmed'); }
    else if (nearbyMatchConfidence === 'medium') { score += 20; factors.push('Nearby match found'); }
    else { score += 10; factors.push('Possible nearby match'); }
  }

  // Distance penalty — farther away = less confident
  if (distanceMeters !== null && distanceMeters !== undefined) {
    if (distanceMeters > 300) score = Math.max(score - 15, 0);
    else if (distanceMeters > 150) score = Math.max(score - 8, 0);
  }

  const level = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';
  const label = score >= 75 ? 'High Confidence' : score >= 45 ? 'Medium Confidence' : 'Low Confidence';
  const color = score >= 75 ? '#00E5A0' : score >= 45 ? '#FFC800' : '#FF6B2B';

  return { score, level, label, color, factors };
}

export async function runGeoTargetAssist({ businessName, coords, heading }) {
  const results = {
    userCoords: coords,
    heading,
    nearbyMatches: [],
    bestMatch: null,
    reverseGeo: null,
    confidence: null,
  };

  // Run reverse geocode and nearby match in parallel
  const [reverseGeo, nearbyMatch] = await Promise.all([
    coords ? reverseGeocodeCoords(coords) : null,
    businessName && coords ? geocodeBusinessNearby(businessName, coords) : null,
  ]);

  results.reverseGeo = reverseGeo;

  if (nearbyMatch) {
    results.nearbyMatches = [nearbyMatch];
    results.bestMatch = nearbyMatch;
  }

  // Calculate confidence
  results.confidence = calculateGeoTargetConfidence({
    hasGps: !!coords,
    hasHeading: !!heading,
    hasOcrBusinessName: !!businessName,
    hasOcrAddress: !!(nearbyMatch?.streetName || reverseGeo?.streetName),
    hasNearbyMatch: !!nearbyMatch,
    nearbyMatchConfidence: nearbyMatch?._matchConfidence || null,
    distanceMeters: nearbyMatch?._distanceMeters ?? null,
  });

  return results;
}
