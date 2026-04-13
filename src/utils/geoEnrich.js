import * as Location from 'expo-location';

/**
 * Get current device coordinates.
 * Returns { latitude, longitude } or null if unavailable.
 */
export async function getCurrentCoords() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
    });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Search OpenStreetMap Nominatim for a business near given coordinates.
 * Free, no API key required.
 * @param {string} businessName
 * @param {{ latitude: number, longitude: number }} coords
 * @returns {object|null} address fields if found
 */
export async function geocodeBusinessNearby(businessName, coords) {
  if (!businessName || !coords) return null;

  try {
    // Search within ~1km radius using viewbox
    const delta = 0.009; // ~1km
    const { latitude: lat, longitude: lng } = coords;
    const viewbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(businessName)}&` +
      `format=json&addressdetails=1&limit=3&` +
      `viewbox=${viewbox}&bounded=1`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'LeadLens/1.0 (field-sales-app)' },
    });
    if (!resp.ok) return null;

    const results = await resp.json();
    if (!results.length) {
      // Broaden search to 5km if nothing found nearby
      const delta2 = 0.045;
      const viewbox2 = `${lng - delta2},${lat - delta2},${lng + delta2},${lat + delta2}`;
      const url2 = `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(businessName)}&` +
        `format=json&addressdetails=1&limit=3&` +
        `viewbox=${viewbox2}&bounded=1`;
      const resp2 = await fetch(url2, {
        headers: { 'User-Agent': 'LeadLens/1.0 (field-sales-app)' },
      });
      if (!resp2.ok) return null;
      const results2 = await resp2.json();
      if (!results2.length) return null;
      return parseNominatimResult(results2[0]);
    }

    return parseNominatimResult(results[0]);
  } catch {
    return null;
  }
}

function parseNominatimResult(result) {
  if (!result?.address) return null;
  const a = result.address;

  // Extract street number and name
  const houseNumber = a.house_number || '';
  const road = a.road || a.pedestrian || a.street || '';
  const city = a.city || a.town || a.village || a.suburb || '';
  const state = a.state || '';
  const postcode = a.postcode || '';

  // Only return if we have at least some useful address data
  if (!road && !city) return null;

  return {
    streetNumber: houseNumber,
    streetName: road,
    city,
    state: abbreviateState(state),
    zip: postcode,
    _geoSource: 'OpenStreetMap',
  };
}

// Convert full state names to 2-letter abbreviations
const STATE_MAP = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
  'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
  'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
  'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
  'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
  'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
  'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
};

function abbreviateState(state) {
  if (!state) return '';
  if (state.length === 2) return state.toUpperCase();
  return STATE_MAP[state] || state.substring(0, 2).toUpperCase();
}
