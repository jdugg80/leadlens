import { reverseGeocodeCoords } from './geoEnrich';

const FEET_TO_METERS = 0.3048;
const METERS_TO_FEET = 3.28084;

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(llc|inc|co|corp|corporation|company|ltd)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(a = '', b = '') {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) matches += 1;
  }
  return matches / Math.max(leftTokens.size, rightTokens.size);
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

function buildAddressFromTags(tags = {}) {
  const streetNumber = tags['addr:housenumber'] || '';
  const streetName = tags['addr:street'] || '';
  const addressLine2 = tags['addr:unit'] || tags['addr:suite'] || '';
  const city = tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || '';
  const state = tags['addr:state'] || '';
  const zip = tags['addr:postcode'] || '';
  return { streetNumber, streetName, addressLine2, city, state, zip };
}

function extractNameFromOcr(ocrText = '') {
  const lines = String(ocrText || '')
    .split(/\n+|\|+|•|·/)
    .map((line) => line.trim())
    .filter(Boolean);

  const banned = ['open', 'closed', 'hours', 'suite', 'ste', 'phone', 'tel', 'exit', 'entrance', 'parking', 'push', 'pull', 'welcome'];

  return (
    lines
      .filter((line) => line.length >= 3)
      .filter((line) => !/^\d+$/.test(line))
      .filter((line) => !banned.some((term) => normalizeText(line).includes(term)))
      .sort((a, b) => b.replace(/[^a-z]/gi, '').length - a.replace(/[^a-z]/gi, '').length)[0] || ''
  );
}

function resultToLeadFields(place = {}) {
  return {
    businessName: place.name || '',
    streetNumber: place.streetNumber || '',
    streetName: place.streetName || '',
    addressLine2: place.addressLine2 || '',
    city: place.city || '',
    state: place.state || '',
    zip: place.zip || '',
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

async function fetchNearbyOsmPlaces(coords, radiusFeet) {
  if (!coords?.latitude || !coords?.longitude) return [];
  const radiusMeters = Math.round(Math.min(500, Math.max(75, safeNumber(radiusFeet, 120) * FEET_TO_METERS)));
  const { latitude, longitude } = coords;

  const query = `
    [out:json][timeout:10];
    (
      node(around:${radiusMeters},${latitude},${longitude})["name"]["shop"];
      node(around:${radiusMeters},${latitude},${longitude})["name"]["amenity"];
      node(around:${radiusMeters},${latitude},${longitude})["name"]["office"];
      node(around:${radiusMeters},${latitude},${longitude})["name"]["tourism"];
      node(around:${radiusMeters},${latitude},${longitude})["name"]["craft"];
      node(around:${radiusMeters},${latitude},${longitude})["name"]["healthcare"];
      node(around:${radiusMeters},${latitude},${longitude})["name"]["commercial"];
      way(around:${radiusMeters},${latitude},${longitude})["name"]["shop"];
      way(around:${radiusMeters},${latitude},${longitude})["name"]["amenity"];
      way(around:${radiusMeters},${latitude},${longitude})["name"]["office"];
      way(around:${radiusMeters},${latitude},${longitude})["name"]["tourism"];
      way(around:${radiusMeters},${latitude},${longitude})["name"]["craft"];
      way(around:${radiusMeters},${latitude},${longitude})["name"]["healthcare"];
      way(around:${radiusMeters},${latitude},${longitude})["name"]["building"];
      relation(around:${radiusMeters},${latitude},${longitude})["name"]["shop"];
      relation(around:${radiusMeters},${latitude},${longitude})["name"]["amenity"];
      relation(around:${radiusMeters},${latitude},${longitude})["name"]["office"];
      relation(around:${radiusMeters},${latitude},${longitude})["name"]["building"];
    );
    out center tags 40;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) throw new Error(`Overpass lookup failed: ${response.status}`);
  const json = await response.json();
  const elements = Array.isArray(json?.elements) ? json.elements : [];

  const deduped = new Map();

  elements.forEach((item) => {
    const tags = item.tags || {};
    const lat = item.lat || item.center?.lat;
    const lon = item.lon || item.center?.lon;
    if (!tags.name || !lat || !lon) return;

    const address = buildAddressFromTags(tags);
    const place = {
      id: `osm-${item.type}-${item.id}`,
      source: 'OpenStreetMap nearby POI',
      name: String(tags.name),
      latitude: Number(lat),
      longitude: Number(lon),
      ...address,
      raw: item,
    };

    const key = `${normalizeText(place.name)}-${Math.round(place.latitude * 100000)}-${Math.round(place.longitude * 100000)}`;
    if (!deduped.has(key)) deduped.set(key, place);
  });

  return Array.from(deduped.values());
}

function scorePlace({ place, targetCoords, userCoords, businessName, ocrText, reverseGeo, searchRadiusFeet, targetBox }) {
  const distanceToTarget = haversineMeters(targetCoords, place) ?? 99999;
  const distanceFeet = Math.round(distanceToTarget * METERS_TO_FEET);
  const radiusMeters = Math.max(1, safeNumber(searchRadiusFeet, 120) * FEET_TO_METERS);
  const reasons = [];
  let score = 0;

  const distanceScore = Math.max(0, 35 - (distanceToTarget / radiusMeters) * 35);
  score += distanceScore;
  if (distanceToTarget <= 25) reasons.push('very close to projected target');
  else if (distanceToTarget <= 90) reasons.push('near projected target');

  const ocrName = businessName || extractNameFromOcr(ocrText);
  const nameMatch = tokenSimilarity(ocrName, place.name);
  score += nameMatch * 35;
  if (nameMatch >= 0.75) reasons.push('strong OCR name match');
  else if (nameMatch >= 0.4) reasons.push('partial OCR name match');

  const placeAddress = [place.streetNumber, place.streetName, place.city, place.state, place.zip].filter(Boolean).join(' ');
  const reverseAddress = [reverseGeo?.streetNumber, reverseGeo?.streetName, reverseGeo?.city, reverseGeo?.state, reverseGeo?.zip].filter(Boolean).join(' ');
  const addressMatch = tokenSimilarity(reverseAddress, placeAddress);

  if (place.streetName || place.streetNumber) {
    score += 12;
    reasons.push('has address data');
  }
  if (addressMatch >= 0.35) {
    score += 8;
    reasons.push('address roughly matches reverse geocode');
  }

  if (targetBox) {
    score += 6;
    reasons.push('target-box OCR priority');
  }

  const distanceFromUserMeters = userCoords ? haversineMeters(userCoords, place) : null;

  return {
    ...place,
    ...resultToLeadFields(place),
    score: Math.round(Math.min(100, score)),
    reasons,
    _distanceMeters: Math.round(distanceToTarget),
    _distanceFeet: distanceFeet,
    _distanceFromUserMeters: distanceFromUserMeters === null ? null : Math.round(distanceFromUserMeters),
    _matchConfidence: score >= 72 ? 'high' : score >= 50 ? 'medium' : 'low',
    _geoSource: place.source,
    displayName: place.name,
  };
}

export async function resolveLeadLockBusiness({
  businessName,
  ocrText,
  targetCoords,
  userCoords,
  searchRadiusFeet = 120,
  minimumConfidence = 70,
  targetBox = null,
}) {
  const coordsForLookup = targetCoords || userCoords;
  const reverseGeo = coordsForLookup ? await reverseGeocodeCoords(coordsForLookup) : null;

  let nearbyPlaces = [];
  let lookupError = null;

  try {
    nearbyPlaces = await fetchNearbyOsmPlaces(coordsForLookup, searchRadiusFeet);
  } catch (err) {
    lookupError = err?.message || 'Nearby POI lookup failed';
  }

  const candidates = nearbyPlaces
    .map((place) =>
      scorePlace({
        place,
        targetCoords: coordsForLookup,
        userCoords,
        businessName,
        ocrText,
        reverseGeo,
        searchRadiusFeet,
        targetBox,
      })
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const bestMatch = candidates[0] || null;
  const confidenceScore = bestMatch?.score || 0;

  return {
    userCoords,
    targetCoords: coordsForLookup,
    reverseGeo,
    nearbyMatches: candidates,
    bestMatch,
    needsUserSelection: !bestMatch || confidenceScore < minimumConfidence || candidates.length > 1,
    confidence: {
      score: confidenceScore,
      level: confidenceScore >= 72 ? 'high' : confidenceScore >= 50 ? 'medium' : 'low',
      label: confidenceScore >= 72 ? 'High Confidence' : confidenceScore >= 50 ? 'Medium Confidence' : 'Low Confidence',
      color: confidenceScore >= 72 ? '#00E5A0' : confidenceScore >= 50 ? '#FFC800' : '#FF6B2B',
      factors: bestMatch?.reasons || [],
    },
    debug: {
      businessName,
      ocrName: extractNameFromOcr(ocrText),
      targetCoords: coordsForLookup,
      userCoords,
      searchRadiusFeet,
      minimumConfidence,
      targetBox,
      nearbyCandidateCount: nearbyPlaces.length,
      lookupError,
      bestMatch,
    },
  };
}
