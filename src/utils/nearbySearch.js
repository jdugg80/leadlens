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
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY
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
  if (!radius || radius <= 0) return 1500;
  return Math.min(Math.max(radius, 250), 50000);
}

export const BUSINESS_TYPE_BUCKETS = {
  ALL_BUSINESSES: 'All Businesses',
  FOOD_HOSPITALITY: 'Food / Hospitality',
  RETAIL_CONSUMER: 'Retail / Consumer',
  INDUSTRIAL_LOGISTICS: 'Industrial / Logistics',
  OFFICE_PROFESSIONAL: 'Office / Professional',
  PUBLIC_FACILITIES: 'Public / Facilities',
  MULTI_FAMILY_RESIDENTIAL: 'Multi-Family / Residential-Adjacent',
  INSTITUTIONAL: 'Institutional',
  OTHER: 'Other',
};

// Maps Google Places types to the UI business type buckets used in TerritoryMap filters.
const BUCKET_MAPPING = {
  [BUSINESS_TYPE_BUCKETS.FOOD_HOSPITALITY]: [
    'restaurant', 'cafe', 'coffee_shop', 'bar', 'bakery', 'food', 'meal_takeaway',
    'meal_delivery', 'hotel', 'lodging', 'motel', 'night_club', 'nightclub', 'winery',
    'brewery', 'meal_delivery', 'catering', 'food_delivery', 'cafeteria', 'ice_cream_shop',
    'dessert_shop', 'juice_shop', 'tea_house', 'wine_bar', 'pub', 'sushi_restaurant',
    'pizza_restaurant', 'fast_food_restaurant', 'steak_house', 'seafood_restaurant',
    'hamburger_restaurant', 'sandwich_shop', 'ramen_restaurant', 'vegan_restaurant',
    'vegetarian_restaurant', 'breakfast_restaurant', 'brunch_restaurant', 'buffet_restaurant',
  ],
  [BUSINESS_TYPE_BUCKETS.RETAIL_CONSUMER]: [
    'store', 'convenience_store', 'hardware_store', 'electronics_store', 'clothing_store',
    'grocery_or_supermarket', 'supermarket', 'department_store', 'shopping_mall', 'shoe_store',
    'jewelry_store', 'furniture_store', 'home_goods_store', 'pet_store', 'book_store', 'florist',
    'beauty_salon', 'hair_care', 'hair_salon', 'spa', 'nail_salon', 'skin_care_service',
    'gas_station', 'car_repair', 'auto_parts_store', 'car_dealer', 'car_rental', 'car_wash',
    'auto_detailing', 'motorcycle_dealer', 'motorcycle_repair', 'motorcycle_parts',
    'pharmacy', 'drugstore', 'liquor_store', 'wine_shop', 'tobacco_store', 'vape_store',
    'bicycle_store', 'sporting_goods_store', 'toy_store', 'gift_shop', 'pawn_shop',
    'thrift_store', 'antique_store', 'art_gallery', 'stationery_store', 'office_supply_store',
    'mobile_phone_store', 'computer_store', 'electronics_store', 'appliance_store',
    'kitchen_supply_store', 'bed_and_breakfast_supply', 'market', 'farmers_market',
  ],
  [BUSINESS_TYPE_BUCKETS.INDUSTRIAL_LOGISTICS]: [
    'warehouse', 'storage', 'manufacturer', 'factory', 'manufacturing', 'industrial',
    'distribution', 'truck_stop', 'truck_dealer', 'transit_station', 'transit_depot',
    'moving_company', 'shipping_company', 'shipping_service', 'courier_service',
    'freight_forwarding_service', 'logistics_service', 'farm', 'ranch', 'quarry', 'mine',
    'construction_company', 'electrician', 'plumber', 'roofing_contractor', 'general_contractor',
    'locksmith', 'painter', 'hvac', 'heating_contractor', 'air_conditioning_contractor',
    'flooring_contractor', 'carpenter', 'welder', 'machine_shop', 'metal_fabricator',
    'building_materials_store', 'lumber_yard', 'concrete_contractor', 'paving_contractor',
    'excavation_contractor', 'demolition_contractor', 'crane_service', 'trucking_company',
  ],
  [BUSINESS_TYPE_BUCKETS.OFFICE_PROFESSIONAL]: [
    'office', 'real_estate_agency', 'insurance_agency', 'lawyer', 'attorney', 'legal_services',
    'doctor', 'physician', 'dentist', 'dental_clinic', 'health', 'medical_clinic', 'clinic',
    'physiotherapist', 'physical_therapist', 'chiropractor', 'psychologist', 'mental_health',
    'veterinary_care', 'animal_hospital', 'accountant', 'accounting', 'bank', 'atm', 'finance',
    'financial_advisor', 'investment_advisor', 'mortgage_broker', 'credit_union', 'stock_broker',
    'corporate_office', 'coworking_space', 'business_center', 'consulting', 'marketing_agency',
    'advertising_agency', 'public_relations_agency', 'software_company', 'technology_company',
    'it_services', 'web_designer', 'graphic_designer', 'photography_service', 'translation_service',
    'employment_agency', 'recruiter', 'human_resource_consultant', 'payroll_service', 'tax_preparer',
    'bookkeeping_service', 'notary', 'title_company', 'escrow_service', 'property_management',
    'architect', 'engineering', 'interior_designer', 'landscape_architect', 'surveyor',
  ],
  [BUSINESS_TYPE_BUCKETS.PUBLIC_FACILITIES]: [
    'school', 'university', 'college', 'primary_school', 'secondary_school', 'high_school',
    'middle_school', 'kindergarten', 'preschool', 'daycare', 'hospital', 'medical_center',
    'urgent_care', 'emergency_room', 'government_office', 'local_government_office',
    'city_hall', 'town_hall', 'post_office', 'fire_station', 'police', 'police_station',
    'library', 'courthouse', 'community_center', 'recreation_center', 'senior_center',
    'youth_center', 'sports_complex', 'stadium', 'arena', 'gym', 'fitness_center', 'swimming_pool',
    'park', 'amusement_park', 'water_park', 'zoo', 'aquarium', 'museum', 'planetarium',
    'convention_center', 'exhibition_center', 'performing_arts_theater', 'movie_theater',
    'events_venue', 'wedding_venue', 'banquet_hall', 'rest_stop', 'weigh_station',
  ],
  [BUSINESS_TYPE_BUCKETS.MULTI_FAMILY_RESIDENTIAL]: [
    'apartment_building', 'apartment_complex', 'condominium', 'condominium_complex',
    'housing_complex', 'assisted_living', 'assisted_living_facility', 'senior_living',
    'senior_living_community', 'nursing_home', 'retirement_community', 'retirement_home',
    'group_home', 'rehabilitation_center', 'homeless_shelter', 'halfway_house',
    'residential_complex', 'residential_building', 'lodging', 'extended_stay_hotel',
  ],
  [BUSINESS_TYPE_BUCKETS.INSTITUTIONAL]: [
    'school', 'university', 'college', 'educational_institution', 'government_office',
    'local_government_office', 'city_hall', 'courthouse', 'library', 'museum', 'archive',
    'church', 'place_of_worship', 'hindu_temple', 'mosque', 'synagogue', 'cemetery',
    'funeral_home', 'memorial_park', 'religious_organization', 'charity', 'non_profit',
    'embassy', 'consulate', 'post_office', 'prison', 'detention_center', 'military_base',
  ],
};

export const RESIDENTIAL_TYPE_BUCKETS = {
  SINGLE_FAMILY: 'Single-Family',
  MULTI_FAMILY: 'Multi-Family (2-4)',
  CONDO_TOWNHOUSE: 'Condo/Townhouse',
  MOBILE_HOME: 'Mobile/Manufactured',
  NEW_CONSTRUCTION: 'New Construction',
};

/**
 * Classifies a Google Place into one of the requested business type buckets.
 */
export function classifyGooglePlace(place) {
  const types = place?.types || [];
  const primaryType = place?.primaryType || '';

  const allTypes = [primaryType, ...types].filter(Boolean);

  for (const [bucket, mappedTypes] of Object.entries(BUCKET_MAPPING)) {
    if (allTypes.some(t => mappedTypes.includes(t))) {
      return bucket;
    }
  }

  return BUSINESS_TYPE_BUCKETS.OTHER;
}

/**
 * Classifies a residential property record into a residential property type bucket.
 */
export function classifyResidentialProperty(property) {
  const raw = property?.property_type || property?.residential_property_type || property?.property_class || property?.use_code || property?.class || property?.type || '';
  const type = String(raw).toLowerCase().replace(/[-_]/g, ' ').trim();

  if (type.includes('single') || type.includes('detached') || type.includes('residential single') || type.includes('residence')) {
    return RESIDENTIAL_TYPE_BUCKETS.SINGLE_FAMILY;
  }
  if (type.includes('multi') || type.includes('duplex') || type.includes('triplex') || type.includes('fourplex') || type.includes('2 4') || type.includes('2-4')) {
    return RESIDENTIAL_TYPE_BUCKETS.MULTI_FAMILY;
  }
  if (type.includes('condo') || type.includes('condominium') || type.includes('townhouse') || type.includes('townhome')) {
    return RESIDENTIAL_TYPE_BUCKETS.CONDO_TOWNHOUSE;
  }
  if (type.includes('mobile') || type.includes('manufactured') || type.includes('trailer') || type.includes('park home')) {
    return RESIDENTIAL_TYPE_BUCKETS.MOBILE_HOME;
  }
  if (type.includes('new construction') || type.includes('new build') || type.includes('under construction') || type.includes('construction permit')) {
    return RESIDENTIAL_TYPE_BUCKETS.NEW_CONSTRUCTION;
  }

  return null;
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
  if (!apiKey) {
    console.warn('[NearbySearch] searchGooglePlacesByText skipped: no API key');
    return null;
  }

  if (!query || String(query).trim().length === 0) {
    console.warn('[NearbySearch] searchGooglePlacesByText skipped: empty query');
    return null;
  }

  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  try {
    const body = {
      textQuery: String(query).trim(),
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
      console.warn(`[NearbySearch] searchText HTTP ${response.status}:`, json?.error?.message || json);
      return null;
    }

    const places = (json?.places || []).map(normalizeGoogleNewPlace).filter(Boolean);
    console.log(`[NearbySearch] searchText query="${query}" returned ${places.length} places`);
    return places;
  } catch (error) {
    console.error('[NearbySearch] searchText exception:', error?.message);
    return null;
  }
}

/**
 * Health check for the configured Google Places API key.
 * Returns { ok, status, placesFound, message }.
 * This is a lightweight probe using a well-known zip query.
 */
export async function checkGooglePlacesApiHealth(testZip = '77002') {
  const apiKey = getGoogleMapsKey();
  if (!apiKey) {
    return { ok: false, status: 'NO_API_KEY', placesFound: 0, message: 'Google Places API key not configured' };
  }

  try {
    const results = await searchGooglePlacesByText({
      query: `business near ${testZip}`,
      radiusMeters: 1000,
    });

    if (results === null) {
      return { ok: false, status: 'API_ERROR', placesFound: 0, message: 'Google Places API returned an error (check billing / key restrictions)' };
    }

    return {
      ok: true,
      status: 'OK',
      placesFound: results.length,
      message: `API key active. Found ${results.length} places near ${testZip}.`,
    };
  } catch (error) {
    return { ok: false, status: 'EXCEPTION', placesFound: 0, message: error?.message || String(error) };
  }
}

const TEXT_QUERIES = [
  "business",
  "warehouse",
  "shop",
  "office",
  "industrial",
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

  const primaryRadius = normalizeRadius(radiusMeters);
  const radii = [primaryRadius];
  if (primaryRadius < 50000) radii.push(Math.min(primaryRadius * 2, 50000));
  if (primaryRadius * 2 < 50000) radii.push(Math.min(primaryRadius * 4, 50000));

  let finalResults = [];

  for (const radius of radii) {
    console.log(`[NearbySearch] Attempting discovery at ${radius}m...`);

    // 1. Try Google Text Search (Highest Success Rate with restricted keys)
    const textResults = [];
    for (const query of TEXT_QUERIES) {
       const batch = await searchGooglePlacesByText({ query, center: searchCenter, radiusMeters: radius, apiKey: keyOverride });
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
