// ─────────────────────────────────────────────────────────────────────
// ADDRESS LIST IMPORT
// Shared plumbing for two related bulk-import features:
//   - Route import: geocode a raw list of addresses, order them into a
//     single-day route via nearest-neighbor from the rep's current
//     location, and open the result in Google Maps for turn-by-turn nav.
//   - Territory-filtered opportunity import: geocode a raw list, keep
//     only the addresses whose ZIP falls inside the rep's assigned
//     territory, add those to the Prospect Queue, and optionally offer
//     the same route-ordering afterward.
// Both add successfully-geocoded, matched addresses to the Prospect
// Queue, since they'll need exporting eventually either way.
// ─────────────────────────────────────────────────────────────────────

import { geocodeAddress, parseAddressHeuristic } from './addressGeocoder';

// Same alias strategy CaptureScreen.js's Excel import already uses —
// duplicated here since those helpers are file-local there, not exported.
const ADDRESS_HEADER_ALIASES = {
  businessName: ['businessname', 'business', 'name', 'company', 'companyname'],
  address: ['address', 'fulladdress', 'streetaddress', 'location'],
  street: ['street', 'streetname', 'streetaddress1'],
  city: ['city', 'town'],
  state: ['state', 'statecode'],
  zip: ['zip', 'zipcode', 'postalcode'],
};

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function looksLikeHeaderRow(row) {
  if (!Array.isArray(row)) return false;
  const normalized = row.map((c) => normalizeHeader(c));
  const allAliases = Object.values(ADDRESS_HEADER_ALIASES).flat();
  return normalized.some((h) => allAliases.includes(h));
}

function buildColumnIndex(headerRow) {
  const index = {};
  headerRow.forEach((header, i) => {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(ADDRESS_HEADER_ALIASES)) {
      if (!(field in index) && aliases.includes(normalized)) {
        index[field] = i;
      }
    }
  });
  return index;
}

/**
 * Parses a raw array-of-arrays sheet into a flat list of
 * { businessName, rawAddress } candidates. Handles both a proper header
 * row (business name / address in recognizable columns) and a bare list
 * of addresses with no header at all — each non-empty row becomes one
 * candidate either way, so this works whether the file is a structured
 * export or just a plain list someone pasted into a spreadsheet.
 */
export function parseAddressListAOA(aoa) {
  if (!Array.isArray(aoa) || !aoa.length) return [];

  const firstRow = aoa[0];
  const hasHeader = looksLikeHeaderRow(firstRow);
  const dataRows = hasHeader ? aoa.slice(1) : aoa;
  const colIndex = hasHeader ? buildColumnIndex(firstRow) : null;

  const entries = [];
  for (const row of dataRows) {
    if (!Array.isArray(row) || !row.length) continue;
    const nonEmpty = row.filter((c) => String(c ?? '').trim() !== '');
    if (!nonEmpty.length) continue;

    let businessName = '';
    let rawAddress = '';

    if (colIndex) {
      businessName = colIndex.businessName != null ? String(row[colIndex.businessName] ?? '').trim() : '';
      if (colIndex.address != null) {
        rawAddress = String(row[colIndex.address] ?? '').trim();
      } else {
        const parts = [colIndex.street, colIndex.city, colIndex.state, colIndex.zip]
          .map((i) => (i != null ? String(row[i] ?? '').trim() : ''))
          .filter(Boolean);
        rawAddress = parts.join(', ');
      }
    }

    // Fallback: no usable header-based address column found — treat the
    // whole row as the address (joins every non-empty cell in it).
    if (!rawAddress) {
      rawAddress = nonEmpty.join(', ');
    }

    if (rawAddress) {
      entries.push({ businessName, rawAddress });
    }
  }

  return entries;
}

/**
 * Geocodes a list of { businessName, rawAddress } entries via the
 * existing Nominatim-based geocoder (already rate-limited and cached).
 * Reports progress via onProgress({ current, total }) for a live status
 * message during a potentially slow batch (Nominatim is capped to
 * roughly 1 request/second).
 */
export async function geocodeAddressEntries(entries, onProgress) {
  const results = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const geo = await geocodeAddress(entry.rawAddress);
    results.push({ ...entry, ...geo });
    if (onProgress) onProgress({ current: i + 1, total: entries.length });
  }
  return results;
}

/**
 * Builds a lead/prospect record from a geocoded entry, using the free
 * synchronous heuristic parser (parseAddressHeuristic) to break the raw
 * address string into street/city/state/zip components — this reuses
 * the address text already geocoded above rather than making a second
 * network call just to get structured fields.
 */
export function buildLeadFromGeocodedEntry(entry) {
  const parsed = parseAddressHeuristic(entry.rawAddress) || {};
  return {
    businessName: entry.businessName || '',
    streetNumber: parsed.streetNumber || '',
    streetName: parsed.streetName || '',
    city: parsed.city || '',
    state: parsed.state || '',
    zip: parsed.zip || '',
    latitude: entry.latitude ?? null,
    longitude: entry.longitude ?? null,
    propertyType: 'Commercial',
    status: 'new',
    captureMethod: 'address-import',
    reviewed: false,
    rawExtractedText: entry.rawAddress,
  };
}

/**
 * Filters geocoded entries down to only those whose parsed ZIP is in the
 * rep's assigned territory (myZips, from territoryUtils' loadMyZips()).
 * Entries with no resolvable ZIP are treated as non-matching rather than
 * silently included — an address we can't place shouldn't be assumed to
 * be in-territory.
 */
export function filterEntriesByTerritory(entries, myZips) {
  const zipSet = new Set((myZips || []).map((z) => z.zip));
  const matched = [];
  const unmatched = [];
  for (const entry of entries) {
    const parsed = parseAddressHeuristic(entry.rawAddress) || {};
    const zip = parsed.zip || '';
    if (zip && zipSet.has(zip)) {
      matched.push({ ...entry, zip });
    } else {
      unmatched.push({ ...entry, zip });
    }
  }
  return { matched, unmatched };
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Orders a list of geocoded points into a single-day route using a
 * simple greedy nearest-neighbor algorithm, starting from the rep's
 * current location. Only points that successfully geocoded are
 * included in the route; anything that failed is returned separately
 * so it can be shown to the user rather than silently dropped.
 */
export function orderRouteNearestNeighbor(startCoords, points) {
  const geocoded = points.filter((p) => p.success && p.latitude != null && p.longitude != null);
  const failed = points.filter((p) => !(p.success && p.latitude != null && p.longitude != null));

  const remaining = [...geocoded];
  const ordered = [];
  let current = { latitude: startCoords.latitude, longitude: startCoords.longitude };

  while (remaining.length) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistanceMeters(current.latitude, current.longitude, remaining[i].latitude, remaining[i].longitude);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }
    const next = remaining.splice(nearestIdx, 1)[0];
    ordered.push(next);
    current = { latitude: next.latitude, longitude: next.longitude };
  }

  return { ordered, failed };
}

/**
 * Builds a Google Maps multi-stop directions URL from an ordered list of
 * geocoded points, starting from the rep's current location. Google Maps
 * caps waypoints at 25 total stops (origin + up to 23 waypoints +
 * destination); anything beyond that is truncated to the first 25 so the
 * URL stays valid rather than silently failing to open.
 */
export function buildGoogleMapsRouteUrl(startCoords, orderedPoints) {
  const MAX_STOPS = 25;
  const points = orderedPoints.slice(0, MAX_STOPS);
  if (!points.length) return null;

  const origin = `${startCoords.latitude},${startCoords.longitude}`;
  const destination = `${points[points.length - 1].latitude},${points[points.length - 1].longitude}`;
  const waypoints = points
    .slice(0, -1)
    .map((p) => `${p.latitude},${p.longitude}`)
    .join('|');

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  if (waypoints) params.set('waypoints', waypoints);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
