// src/utils/mapSafety.js
// LeadLens map safety helpers.
// These prevent react-native-maps from receiving invalid coordinates or malformed polygons.

export const DEFAULT_TERRITORY_REGION = {
  latitude: 29.7604,
  longitude: -95.3698,
  latitudeDelta: 0.45,
  longitudeDelta: 0.45,
};

export function toSafeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

export function isValidCoordinate(latitude, longitude) {
  const lat = toSafeNumber(latitude);
  const lng = toSafeNumber(longitude);
  return (
    lat !== null &&
    lng !== null &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001) // Avoid near 0,0 which is usually unset/failed
  );
}

export function makeSafeCoordinate(item = {}) {
  if (!item || typeof item !== 'object') return null;
  const latitude =
    toSafeNumber(item.latitude) ??
    toSafeNumber(item.lat) ??
    toSafeNumber(item.y) ??
    toSafeNumber(item?.coordinate?.latitude) ??
    toSafeNumber(item?.coords?.latitude);
  const longitude =
    toSafeNumber(item.longitude) ??
    toSafeNumber(item.lng) ??
    toSafeNumber(item.lon) ??
    toSafeNumber(item.x) ??
    toSafeNumber(item?.coordinate?.longitude) ??
    toSafeNumber(item?.coords?.longitude);

  if (!isValidCoordinate(latitude, longitude)) return null;
  return { latitude, longitude };
}

export function makeSafeMarkers(items = [], label = 'marker') {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const coordinate = makeSafeCoordinate(item);
      if (!coordinate) return null;
      return { ...item, coordinate };
    })
    .filter(Boolean);
}

export function normalizePolygonPoints(rawPoints) {
  if (!Array.isArray(rawPoints)) return [];
  return rawPoints
    .map((point) => {
      if (Array.isArray(point)) {
        const longitude = toSafeNumber(point[0]);
        const latitude = toSafeNumber(point[1]);
        return { latitude, longitude };
      }
      return point;
    })
    .filter(Boolean);
}

export function makeSafePolygonCoordinates(points = [], label = 'polygon') {
  const normalizedPoints = normalizePolygonPoints(points);
  const safePoints = normalizedPoints
    .map((point) => makeSafeCoordinate(point))
    .filter(Boolean);

  if (safePoints.length < 3) return [];
  return safePoints;
}

/**
 * Takes raw GeoJSON coordinate arrays (possibly nested) and returns
 * a flat array of {latitude, longitude} objects safe for react-native-maps <Polygon>.
 * Filters out any invalid or non-finite coordinate pairs.
 */
export function makeSafePolygons(rawCoords) {
  if (!rawCoords || !Array.isArray(rawCoords)) return [];

  // GeoJSON polygons are arrays of rings; the first ring is the outer boundary.
  // Coordinates may be nested 1, 2, or 3 levels deep depending on the source.
  let flat = rawCoords;

  // Unwrap one level if it's an array-of-arrays-of-arrays (MultiPolygon outer shell)
  if (Array.isArray(flat[0]) && Array.isArray(flat[0][0]) && Array.isArray(flat[0][0][0])) {
    flat = flat[0]; // Take the first polygon of a MultiPolygon
  }

  // Unwrap ring level: array of [lng, lat] pairs or {latitude, longitude} objects.
  if (
    Array.isArray(flat[0]) && (
      Array.isArray(flat[0][0]) ||
      (flat[0][0] && typeof flat[0][0] === 'object' && (
        ('latitude' in flat[0][0] && 'longitude' in flat[0][0]) ||
        ('lat' in flat[0][0] && 'lng' in flat[0][0])
      ))
    )
  ) {
    flat = flat[0]; // Take the outer ring
  }

  // Now flat should be an array of [lng, lat] or {lat, lng} pairs
  return flat
    .map(coord => {
      if (Array.isArray(coord) && coord.length >= 2) {
        const lng = parseFloat(coord[0]);
        const lat = parseFloat(coord[1]);
        if (isFinite(lat) && isFinite(lng)) return { latitude: lat, longitude: lng };
      }
      if (coord && typeof coord === 'object' && 'latitude' in coord && 'longitude' in coord) {
        const lat = parseFloat(coord.latitude);
        const lng = parseFloat(coord.longitude);
        if (isFinite(lat) && isFinite(lng)) return { latitude: lat, longitude: lng };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Returns a valid region object.
 * If the input is invalid, it uses the provided fallback.
 * If the fallback is also missing, it uses the global default territory region.
 */
export function makeSafeRegion(region, fallback = null) {
  const useFallback = fallback || DEFAULT_TERRITORY_REGION;
  if (!region) return useFallback;

  const latitude = toSafeNumber(region.latitude);
  const longitude = toSafeNumber(region.longitude);
  const latitudeDelta = toSafeNumber(region.latitudeDelta);
  const longitudeDelta = toSafeNumber(region.longitudeDelta);

  // Use fallback if coordinates are missing or invalid (e.g. 0,0)
  if (!isValidCoordinate(latitude, longitude)) {
    return useFallback;
  }

  return {
    latitude,
    longitude,
    latitudeDelta:
      latitudeDelta && latitudeDelta > 0 && latitudeDelta < 90
        ? latitudeDelta
        : useFallback.latitudeDelta || DEFAULT_TERRITORY_REGION.latitudeDelta,
    longitudeDelta:
      longitudeDelta && longitudeDelta > 0 && longitudeDelta < 180
        ? longitudeDelta
        : useFallback.longitudeDelta || DEFAULT_TERRITORY_REGION.longitudeDelta,
  };
}
