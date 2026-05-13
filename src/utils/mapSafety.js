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
 * Filters an array of polygon objects, returning only those with 3+ valid coordinates.
 * Each polygon object is expected to have a `coordinates` array.
 */
export function makeSafePolygons(polygons = [], coordinatesKey = 'coordinates') {
  if (!Array.isArray(polygons)) return [];
  return polygons
    .map((polygon) => {
      if (!polygon || typeof polygon !== 'object') return null;
      const raw = polygon[coordinatesKey];
      const safe = makeSafePolygonCoordinates(raw || []);
      if (safe.length < 3) return null;
      return { ...polygon, [coordinatesKey]: safe };
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
