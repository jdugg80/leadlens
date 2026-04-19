import * as Location from 'expo-location';

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

export async function reverseGeocodeCoords(coords) {
  if (!coords?.latitude || !coords?.longitude) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&addressdetails=1`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'LeadLens/1.9 (storefront-scan)' } });
    if (!resp.ok) return null;
    const result = await resp.json();
    return {
      ...parseNominatimResult(result),
      latitude: coords.latitude,
      longitude: coords.longitude,
      _geoSource: 'OpenStreetMap reverse geocode',
      _geoDisplayName: result?.display_name || '',
      _matchConfidence: 'medium',
      _distanceMeters: 0,
    };
  } catch {
    return null;
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
      const resp = await fetch(url, { headers: { 'User-Agent': 'LeadLens/1.9 (storefront-scan)' } });
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
  const city = a.city || a.town || a.village || a.suburb || a.county || '';
  const state = a.state || a.state_code || '';
  const postcode = a.postcode || '';

  return {
    streetNumber: houseNumber,
    streetName: road,
    city,
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
