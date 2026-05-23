// src/utils/nearbySearch.js
// LeadLens nearby business search helper.
// Tries Google Places first, then OpenStreetMap Overpass fallback.

import Constants from 'expo-constants';

function toNumber(value) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function getGoogleMapsKey(overrideKey = null) {
  // If the caller passes the key directly (e.g. from TerritoryMapScreen), use it immediately.
  if (overrideKey) return overrideKey;

  const config = Constants?.expoConfig || Constants?.manifest || {};
  const androidConfig = config.android?.config?.googleMaps || {};
  const extraConfig = config.extra || {};

  const key = (
    extraConfig.googlePlacesApiKey ||
    androidConfig.apiKey ||
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
    'AIzaSyBjzIQsLGY1E3paPr8XROVWg83e_JLOJzI'
  );

  if (!key) {
    console.warn('[NearbySearch] WARNING: No Google Maps API key found in any config path.', {
      hasExpoConfig: !!Constants?.expoConfig,
      hasManifest: !!Constants?.manifest,
    });
  }

  return key;
}

function getCenter(input = {}) {
  const latitude =
    toNumber(input.latitude) ??
    toNumber(input.lat) ??
    toNumber(input?.region?.latitude) ??
    toNumber(input?.center?.latitude);

  const longitude =
    toNumber(input.longitude) ??
    toNumber(input.lng) ??
    toNumber(input.lon) ??
    toNumber(input?.region?.longitude) ??
    toNumber(input?.center?.longitude);

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeRadius(radiusMeters) {
  const radius = toNumber(radiusMeters);
  if (!radius || radius <= 0) return 1200;
  return Math.min(Math.max(radius, 250), 5000);
}

export const BUSINESS_TYPE_BUCKETS = {
  ALL: 'All',
  FOOD_HOSPITALITY: 'Food / Hospitality',
  RETAIL_CONSUMER: 'Retail / Consumer',
  INDUSTRIAL_LOGISTICS: 'Industrial / Logistics',
  OFFICE_PROFESSIONAL: 'Office / Professional',
  PUBLIC_FACILITIES: 'Public / Facilities',
};

const BUCKET_MAPPING = {
  [BUSINESS_TYPE_BUCKETS.FOOD_HOSPITALITY]: [
    'restaurant', 'cafe', 'bar', 'bakery', 'food', 'meal_takeaway', 'hotel', 'lodging'
  ],
  [BUSINESS_TYPE_BUCKETS.RETAIL_CONSUMER]: [
    'store', 'convenience_store', 'hardware_store', 'electronics_store', 'clothing_store',
    'grocery_store', 'gas_station', 'car_repair', 'auto_parts_store', 'beauty_salon',
    'hair_care'
  ],
  [BUSINESS_TYPE_BUCKETS.INDUSTRIAL_LOGISTICS]: [
    'manufacturer', 'supplier', 'storage', 'warehouse_store', 'wholesaler',
    'transportation_service', 'truck_stop', 'transit_depot', 'moving_company',
    'shipping_service', 'farm', 'ranch'
  ],
  [BUSINESS_TYPE_BUCKETS.OFFICE_PROFESSIONAL]: [
    'corporate_office', 'business_center', 'coworking_space', 'consultant',
    'accounting', 'bank', 'real_estate_agency', 'insurance_agency', 'lawyer',
    'doctor', 'dentist'
  ],
  [BUSINESS_TYPE_BUCKETS.PUBLIC_FACILITIES]: [
    'school', 'university', 'hospital', 'government_office', 'local_government_office',
    'post_office', 'fire_station', 'police', 'church', 'apartment_building',
    'courthouse'
  ],
};

/**
 * Classifies a Google Place into one of the requested business type buckets.
 */
export function classifyGooglePlace(place) {
  const types = place.types || [];
  const primaryType = place.primaryType || '';

  const allTypes = [primaryType, ...types].filter(Boolean);

  for (const [bucket, mappedTypes] of Object.entries(BUCKET_MAPPING)) {
    if (allTypes.some(t => mappedTypes.includes(t))) {
      return bucket;
    }
  }

  return 'Other Commercial';
}

function normalizeGoogleNewPlace(place) {
  const latitude = toNumber(place?.location?.latitude);
  const longitude = toNumber(place?.location?.longitude);
  if (latitude === null || longitude === null) return null;

  return {
    placeId: place.id || place.name || `google_${latitude}_${longitude}`,
    name: place?.displayName?.text || 'Nearby Business',
    address: place.formattedAddress || place.shortFormattedAddress || '',
    fullAddress: place.formattedAddress || '',
    coords: { latitude, longitude },
    source: 'google_places_new',
    types: place.types || [],
    primaryType: place.primaryType || '',
    businessStatus: place.businessStatus || '',
    googleMapsUri: place.googleMapsUri || '',
    website: place.websiteUri || '',
    phone: place.internationalPhoneNumber || '',
    rating: place.rating || null,
    user_ratings_total: place.userRatingCount || 0,
    opening_hours: place.regularOpeningHours ? {
      weekday_text: place.regularOpeningHours.weekdayDescriptions || []
    } : null,
    addressComponents: place.addressComponents || [],
    raw: place,
  };
}

function normalizeGoogleLegacyPlace(place) {
  const latitude = toNumber(place?.geometry?.location?.lat);
  const longitude = toNumber(place?.geometry?.location?.lng);
  if (latitude === null || longitude === null) return null;

  return {
    placeId: place.place_id || `google_${latitude}_${longitude}`,
    name: place.name || 'Nearby Business',
    address: place.vicinity || place.formatted_address || '',
    coords: { latitude, longitude },
    source: 'google_places_legacy',
    types: place.types || [],
    googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&query_place_id=${place.place_id}`,
    raw: place,
  };
}

async function searchGooglePlacesLegacy({ center, radiusMeters, label = 'legacy', apiKey: keyOverride }) {
  const apiKey = getGoogleMapsKey(keyOverride);
  if (!apiKey) return [];

  try {
    const endpoint = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
    const url = `${endpoint}?location=${center.latitude},${center.longitude}&radius=${radiusMeters}&type=establishment&key=${apiKey}`;

    console.log(`[NearbySearch] [${label}] API request to legacy endpoint.`);

    const response = await fetch(url);
    const json = await response.json();

    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      console.warn(`[NearbySearch] [${label}] Status: ${json.status}`, json.error_message || '');
      return null;
    }

    return (json.results || []).map(normalizeGoogleLegacyPlace).filter(Boolean);
  } catch (error) {
    console.error(`[NearbySearch] [${label}] Error:`, error?.message);
    return null;
  }
}

async function searchGooglePlacesNew({ center, radiusMeters, includedTypes = [], label = 'general', apiKey: keyOverride }) {
  const apiKey = getGoogleMapsKey(keyOverride);
  if (!apiKey) {
    console.warn(`[NearbySearch] [${label}] Google Places New skipped: no key.`);
    return [];
  }

  try {
    const body = {
      maxResultCount: 100,
    };

    body.locationRestriction = {
      circle: {
        center: {
          latitude: center.latitude,
          longitude: center.longitude,
        },
        radius: radiusMeters,
      },
    };

    if (includedTypes.length > 0) {
      body.includedTypes = includedTypes;
      body.rankPreference = 'DISTANCE';
    } else {
      body.includedTypes = ['establishment'];
    }

    const endpoint = 'https://places.googleapis.com/v1/places:searchNearby';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.types,places.businessStatus,places.primaryType,places.googleMapsUri',
      },
      body: JSON.stringify(body),
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      console.warn(`[NearbySearch] [${label}] HTTP ${response.status} Error:`, json?.error?.message || json);
      // Return null to signify an actual API failure vs just empty results
      return null;
    }

    return (json?.places || []).map(normalizeGoogleNewPlace).filter(Boolean);
  } catch (error) {
    console.error(`[NearbySearch] [${label}] Fetch Exception:`, error?.message || String(error));
    return null;
  }
}

export async function searchGooglePlacesByText({ query, center, radiusMeters = 5000, apiKey: keyOverride }) {
  const apiKey = getGoogleMapsKey(keyOverride);
  if (!apiKey) return null;

  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  try {
    const body = {
      textQuery: query,
    };

    if (center) {
      body.locationBias = {
        circle: {
          center: {
            latitude: center.latitude,
            longitude: center.longitude,
          },
          radius: radiusMeters,
        },
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.types,places.businessStatus,places.primaryType,places.googleMapsUri,places.websiteUri,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.regularOpeningHours,places.addressComponents',
      },
      body: JSON.stringify(body),
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      console.warn('[NearbySearch] searchText failed:', json?.error?.message || json);
      return null;
    }

    return (json?.places || []).map(normalizeGoogleNewPlace).filter(Boolean);
  } catch (error) {
    console.error('[NearbySearch] searchText exception:', error?.message);
    return null;
  }
}

const COMMERCIAL_TYPES = [
  'corporate_office',
  'business_center',
  'manufacturer',
  'supplier',
  'storage',
  'shipping_service',
  'moving_company',
  'warehouse_store',
  'wholesaler',
  'truck_stop',
  'transportation_service',
  'transit_depot',
  'building_materials_store',
  'hardware_store',
  'store',
  'car_repair',
  'truck_dealer',
  'gas_station',
  'farm',
  'ranch'
];

const TEXT_QUERIES = [
  "business",
  "company",
  "warehouse",
  "industrial",
  "supplier",
  "logistics",
  "distribution",
  "oilfield service",
  "commercial service"
];

function deduplicatePlaces(places = []) {
  const idMap = new Map();
  const nameAddrMap = new Map();
  const unique = [];

  for (const place of places) {
    if (!place.placeId) {
      const key = `${(place.name || '').toLowerCase()}|${(place.address || '').toLowerCase()}`.replace(/[^a-z0-9]/g, '');
      if (!nameAddrMap.has(key)) {
        nameAddrMap.set(key, true);
        unique.push(place);
      }
      continue;
    }

    if (!idMap.has(place.placeId)) {
      idMap.set(place.placeId, true);
      unique.push(place);
    }
  }
  return unique;
}

async function searchOpenStreetMapOverpass({ center, radiusMeters = 1500 }) {
  if (!center?.latitude || !center?.longitude) return [];
  const { latitude, longitude } = center;

  // The most permissive query possible: anything with a name
  const query = `
    [out:json][timeout:25];
    (
      node(around:${radiusMeters},${latitude},${longitude})["name"];
      way(around:${radiusMeters},${latitude},${longitude})["name"];
    );
    out center tags 60;
  `;

  try {
    console.log(`[NearbySearch] [OSM] Permissive query at ${radiusMeters}m...`);
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      console.warn(`[NearbySearch] [OSM] Overpass failed: ${response.status}`);
      return [];
    }

    const json = await response.json();
    const elements = json?.elements || [];

    const results = elements.map((item) => {
      const tags = item.tags || {};
      const lat = item.lat || item.center?.lat;
      const lon = item.lon || item.center?.lon;

      if (!tags.name || !lat || !lon) return null;

      // Extract address components
      const addr = [
        tags['addr:housenumber'],
        tags['addr:street'],
        tags['addr:city']
      ].filter(Boolean).join(' ');

      return {
        placeId: `osm-${item.type}-${item.id}`,
        name: String(tags.name),
        address: addr || tags['addr:full'] || 'OpenStreetMap Discovery',
        coords: { latitude: Number(lat), longitude: Number(lon) },
        source: 'osm_overpass',
        types: [
          tags.shop, tags.amenity, tags.office, tags.craft,
          tags.industrial, tags.commercial, tags.building
        ].filter(Boolean),
        googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
        raw: item,
      };
    }).filter(Boolean);

    console.log(`[NearbySearch] [OSM] Found ${results.length} named locations.`);
    return results;
  } catch (error) {
    console.error('[NearbySearch] [OSM] Error:', error?.message);
    return [];
  }
}

export async function searchNearbyBusinesses({
  latitude,
  longitude,
  region,
  center,
  userLocation,
  radiusMeters = 1500,
  apiKey: keyOverride,
} = {}) {
  const searchCenter = getCenter(userLocation || { latitude, longitude, region, center });

  if (!searchCenter) {
    console.warn('[NearbySearch] Aborted: invalid center.');
    return [];
  }

  // Safety check for 0,0 (often a sign of a failed GPS lock or map not ready)
  if (Math.abs(searchCenter.latitude) < 0.1 && Math.abs(searchCenter.longitude) < 0.1) {
    console.warn('[NearbySearch] Warning: Search center is near 0,0. This may result in zero results.');
  }

  console.log(`[NearbySearch] Target Center: ${searchCenter.latitude.toFixed(4)}, ${searchCenter.longitude.toFixed(4)}`);

  const radii = [2500, 5000]; // Increased default radii
  let finalResults = [];

  for (const radius of radii) {
    console.log(`[NearbySearch] Attempting discovery at ${radius}m...`);

    // 1. Try Google Text Search (Highest Success Rate with restricted keys)
    const textResults = [];
    for (const query of ["business", "warehouse", "shop", "office", "industrial"]) {
       const batch = await searchGooglePlacesByText({ query, center: searchCenter, radiusMeters: 4000, apiKey: keyOverride });
       if (batch) textResults.push(...batch);
       if (textResults.length >= 100) break;
    }
    if (textResults.length > 0) {
      finalResults = deduplicatePlaces(textResults);
      console.log(`[NearbySearch] Found ${finalResults.length} via Google Text Search.`);
      break;
    }

    // 2. Try Google Places New
    const newResults = await searchGooglePlacesNew({
      center: searchCenter,
      radiusMeters: radius,
      label: 'new-api',
      apiKey: keyOverride,
    });

    if (newResults && newResults.length > 0) {
      finalResults = deduplicatePlaces(newResults);
      console.log(`[NearbySearch] Found ${finalResults.length} via Google New API.`);
      break;
    }

    // 3. Try Google Places Legacy
    const legacyResults = await searchGooglePlacesLegacy({
      center: searchCenter,
      radiusMeters: radius,
      label: 'legacy-api',
      apiKey: keyOverride,
    });
    if (legacyResults && legacyResults.length > 0) {
      finalResults = deduplicatePlaces(legacyResults);
      console.log(`[NearbySearch] Found ${finalResults.length} via Google Legacy API.`);
      break;
    }

    // 4. Try OSM at this radius before giving up on Google completely
    const osmAtRadius = await searchOpenStreetMapOverpass({ center: searchCenter, radiusMeters: radius });
    if (osmAtRadius.length > 0) {
      finalResults = osmAtRadius;
      console.log(`[NearbySearch] Found ${finalResults.length} via OSM at ${radius}m.`);
      break;
    }
  }

  // 5. Ultimate Fallback: Aggressive OSM (up to 30km)
  if (finalResults.length === 0) {
    console.log('[NearbySearch] All discovery failed. Trying Aggressive OSM 30km...');
    finalResults = await searchOpenStreetMapOverpass({ center: searchCenter, radiusMeters: 30000 });
  }

  console.log(`[NearbySearch] Final unique results: ${finalResults.length}`);
  return finalResults;
}

export async function fetchPlaceDetails(placeId) {
  const apiKey = getGoogleMapsKey();
  if (!apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,international_phone_number,website,address_components,opening_hours,rating,user_ratings_total,business_status&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();
    return data.result || null;
  } catch {
    return null;
  }
}

/**
 * Enriches a prospect with missing address data by searching Google Places.
 * Uses a prioritized strategy based on available data points.
 */
export async function enrichMissingBusinessAddress(prospect) {
  if (!prospect.businessName) {
    return { ok: false, reason: 'missing_name' };
  }

  // 1. Detect if address data is actually missing
  const isMissing = !prospect.streetName || !prospect.city || !prospect.state || !prospect.zip;
  if (!isMissing) {
    return { ok: true, skipped: true, reason: 'address_exists' };
  }

  console.log(`[AddressEnrich] Starting lookup for: ${prospect.businessName}`);

  try {
    const apiKey = getGoogleMapsKey();
    if (!apiKey) return { ok: false, reason: 'no_api_key' };

    // Determine biasing location
    const leadLat = prospect.latitude ?? prospect.lat ?? prospect.locationLat;
    const leadLng = prospect.longitude ?? prospect.lng ?? prospect.locationLng;
    const leadCoords = (leadLat && leadLng) ? { latitude: Number(leadLat), longitude: Number(leadLng) } : null;

    let results = null;
    let strategy = '';

    // Strategy A: Coordinates + Name
    if (leadCoords) {
      strategy = 'A (Coords + Name)';
      results = await searchGooglePlacesByText({
        query: prospect.businessName,
        center: leadCoords,
        radiusMeters: 1000,
        apiKey,
      });
    }

    // Strategy B: Name + City/State
    if ((!results || results.length === 0) && prospect.city) {
      strategy = 'B (Name + City)';
      results = await searchGooglePlacesByText({
        query: `${prospect.businessName} ${prospect.city} ${prospect.state || ''}`,
        center: leadCoords,
        radiusMeters: 5000,
        apiKey,
      });
    }

    // Strategy C: Name + Phone
    if ((!results || results.length === 0) && prospect.phone) {
      strategy = 'C (Name + Phone)';
      results = await searchGooglePlacesByText({
        query: `${prospect.businessName} ${prospect.phone}`,
        center: leadCoords,
        radiusMeters: 10000,
        apiKey,
      });
    }

    // Strategy D: Name + Website
    if ((!results || results.length === 0) && prospect.website) {
      strategy = 'D (Name + Website)';
      results = await searchGooglePlacesByText({
        query: `${prospect.businessName} ${prospect.website}`,
        center: leadCoords,
        radiusMeters: 10000,
        apiKey,
      });
    }

    // Strategy E: Name Only
    if (!results || results.length === 0) {
      strategy = 'E (Name Only)';
      results = await searchGooglePlacesByText({
        query: prospect.businessName,
        center: leadCoords,
        radiusMeters: 20000,
        apiKey,
      });
    }

    if (!results || results.length === 0) {
      console.log(`[AddressEnrich] No matches found for ${prospect.businessName}`);
      return { ok: true, found: false };
    }

    // 2. Score matches by confidence
    const scoredResults = results.map(match => {
      let score = 0;
      const reasons = [];

      // Name similarity (basic check)
      const nameMatch = match.name.toLowerCase().includes(prospect.businessName.toLowerCase()) ||
                       prospect.businessName.toLowerCase().includes(match.name.toLowerCase());
      if (nameMatch) { score += 40; reasons.push('name_match'); }

      // Supporting evidence
      if (prospect.phone && match.phone && prospect.phone.replace(/\D/g,'') === match.phone.replace(/\D/g,'')) {
        score += 50; reasons.push('phone_verified');
      }
      if (prospect.website && match.website && match.website.includes(prospect.website.replace(/^https?:\/\//,''))) {
        score += 50; reasons.push('website_verified');
      }
      if (leadCoords && match.coords) {
        const dist = getDistanceBetweenMeters(leadCoords, match.coords);
        if (dist !== null && dist < 200) { score += 40; reasons.push('proximity_match'); }
      }

      const confidence = score >= 80 ? 'high' : score >= 40 ? 'medium' : 'low';
      return { ...match, score, confidence, reasons };
    }).sort((a, b) => b.score - a.score);

    const best = scoredResults[0];
    console.log(`[AddressEnrich] Best match: ${best.name} (${best.confidence} confidence) via Strategy ${strategy}`);

    return {
      ok: true,
      found: true,
      best,
      allMatches: scoredResults,
      strategy
    };

  } catch (error) {
    console.error('[AddressEnrich] Fatal Error:', error);
    return { ok: false, error: error.message };
  }
}

function getDistanceBetweenMeters(a, b) {
  const R = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;
  if (!a?.latitude || !b?.latitude) return null;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon), Math.sqrt(1 - (sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon)));
  return Math.round(R * c);
}

export function parseAddressComponents(components = []) {
  const getComp = (type) => components.find((c) => c.types.includes(type))?.longText || components.find((c) => c.types.includes(type))?.long_name || '';
  const getShortComp = (type) => components.find((c) => c.types.includes(type))?.shortText || components.find((c) => c.types.includes(type))?.short_name || '';
  return {
    streetNumber: getComp('street_number'),
    streetName: getComp('route'),
    city: getComp('locality') || getComp('sublocality') || getComp('administrative_area_level_2'),
    state: getShortComp('administrative_area_level_1'),
    zip: getComp('postal_code'),
  };
}
