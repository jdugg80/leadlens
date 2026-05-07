import { reverseGeocodeCoords } from '../../utils/geoEnrich';

export interface JurisdictionInfo {
  city?: string;
  county?: string;
  state: string;
}

export async function resolveJurisdictionsAtCoords(coords: { latitude: number; longitude: number }): Promise<JurisdictionInfo[]> {
  const result = await reverseGeocodeCoords(coords);
  if (!result) return [];

  // Nominatim sometimes puts county in city or vice versa, but geoEnrich already parses it.
  // We need to ensure we have the county name specifically.
  // Let's re-parse or extend reverseGeocodeCoords if needed, but for now we'll use what we have.

  // result from reverseGeocodeCoords looks like:
  // { streetNumber, streetName, city, state, zip, latitude, longitude, _geoDisplayName ... }

  // Extract county from _geoDisplayName if city/state isn't enough,
  // or better, improve reverseGeocodeCoords to return county.

  // For now, let's assume we can get it from the display name if not explicitly in result.
  const info: JurisdictionInfo = {
    city: result.city,
    state: result.state,
  };

  // Crude extraction of county from display name if missing
  if (result._geoDisplayName && result._geoDisplayName.includes('County')) {
    const match = result._geoDisplayName.match(/([^,]+ County)/);
    if (match) {
      info.county = match[1].replace(' County', '').trim();
    }
  }

  return [info];
}

export async function resolveJurisdictionsForViewport(bounds: {
  northEast: { latitude: number; longitude: number };
  southWest: { latitude: number; longitude: number };
}): Promise<JurisdictionInfo[]> {
  // Check center and corners to find all touched jurisdictions
  const center = {
    latitude: (bounds.northEast.latitude + bounds.southWest.latitude) / 2,
    longitude: (bounds.northEast.longitude + bounds.southWest.longitude) / 2,
  };

  const points = [
    center,
    bounds.northEast,
    bounds.southWest,
    { latitude: bounds.northEast.latitude, longitude: bounds.southWest.longitude },
    { latitude: bounds.southWest.latitude, longitude: bounds.northEast.longitude },
  ];

  const results = await Promise.all(points.map(p => resolveJurisdictionsAtCoords(p)));
  const flat = results.flat();

  // Dedupe
  const seen = new Set<string>();
  const unique: JurisdictionInfo[] = [];

  for (const item of flat) {
    const key = `${item.city || ''}|${item.county || ''}|${item.state}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}
