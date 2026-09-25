// src/utils/prospectAroundScoring.js
//
// Pure, testable logic for "Prospect Around": scoring and deduping a batch of
// Nearby Search results against a target location. No React Native imports, so
// this can be unit tested without the app running.
//
// Scoring inputs, per the confirmed design:
//   - distance from the target (closer = stronger)
//   - LensSignal presence (a business with an active compliance/health signal
//     ranks above an identical one with none -- a health violation IS a hotter
//     pest-control lead)
// Vertical/industry match is deliberately NOT a scoring factor here -- it's a
// hard filter applied server-side via Nearby Search's `includedTypes` before
// results ever reach this function, so everything scored here already matches
// the selected vertical (or "any" was selected and nothing was filtered).

function haversineMiles(lat1, lon1, lat2, lon2) {
  if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return Infinity;
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// LensSignal alert_level -> bonus points, matching the severity language already
// used throughout the app (get_lenssignal_by_zips, compliance-ingest).
const SIGNAL_BONUS_BY_ALERT_LEVEL = {
  'Priority Review': 40,
  'Monitor': 20,
  'Opportunity': 15,
  'Good Standing': 5,
  'Opportunity Review': 15, // defensive alias, in case of future naming drift
};

/**
 * Finds the best-matching LensSignal record for a place, by proximity (a
 * signal within ~150m of the place is treated as "this place"). Simple
 * distance match rather than name-matching, since LensSignal records and
 * Places results come from different sources with no shared ID.
 */
function findMatchingSignal(place, lensSignalRecords) {
  if (!Array.isArray(lensSignalRecords) || !lensSignalRecords.length) return null;
  const lat = place?.coordinate?.latitude ?? place?.latitude;
  const lng = place?.coordinate?.longitude ?? place?.longitude;
  if (!isFinite(lat) || !isFinite(lng)) return null;

  const MATCH_RADIUS_MILES = 150 / 1609.34; // ~150 meters
  let best = null;
  let bestDist = Infinity;
  for (const sig of lensSignalRecords) {
    const d = haversineMiles(lat, lng, Number(sig.latitude), Number(sig.longitude));
    if (d < MATCH_RADIUS_MILES && d < bestDist) {
      best = sig;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Scores and sorts a batch of raw Nearby Search results against a target
 * location. Returns them enriched with `_distanceMiles`, `_matchedSignal`, and
 * `_score`, sorted strongest-first, NOT yet sliced to the requested count --
 * slicing happens after dedup so the count reflects what the rep actually sees.
 */
export function scoreProspectResults(places, { origin, radiusMiles, lensSignalRecords } = {}) {
  if (!Array.isArray(places) || !origin) return [];

  return places
    .map((place) => {
      const lat = place?.coordinate?.latitude ?? place?.latitude;
      const lng = place?.coordinate?.longitude ?? place?.longitude;
      const distanceMiles = haversineMiles(origin.latitude, origin.longitude, lat, lng);
      const matchedSignal = findMatchingSignal(place, lensSignalRecords);

      // Distance score: 100 at 0 miles, tapering to 0 at the edge of the
      // requested radius. A radius of 0/undefined is treated as "no distance
      // preference" (flat score) rather than dividing by zero.
      const distanceScore = radiusMiles > 0
        ? Math.max(0, 100 * (1 - distanceMiles / radiusMiles))
        : 50;

      const signalBonus = matchedSignal ? (SIGNAL_BONUS_BY_ALERT_LEVEL[matchedSignal.alert_level] ?? 10) : 0;

      return {
        ...place,
        _distanceMiles: distanceMiles,
        _matchedSignal: matchedSignal,
        _score: distanceScore + signalBonus,
      };
    })
    .sort((a, b) => b._score - a._score);
}

/**
 * Builds a Set of dedup keys from the rep's existing leads/prospects, for
 * filtering out businesses already in their pipeline. Keys on Google placeId
 * when available (most reliable), falling back to a normalized name+city
 * string for records that predate placeId tracking.
 */
export function buildExistingProspectKeys(existingLeads) {
  const keys = new Set();
  for (const lead of existingLeads || []) {
    const placeId = lead?.googlePlaceId || lead?.placeId || lead?.place_id;
    if (placeId) {
      keys.add(`place:${placeId}`);
      continue;
    }
    const name = String(lead?.businessName || lead?.name || '').trim().toLowerCase();
    const city = String(lead?.city || '').trim().toLowerCase();
    if (name) keys.add(`name:${name}|${city}`);
  }
  return keys;
}

function placeDedupKeys(place) {
  const keys = [];
  const placeId = place?.placeId || place?.place_id;
  if (placeId) keys.push(`place:${placeId}`);
  const name = String(place?.name || place?.businessName || '').trim().toLowerCase();
  if (name) keys.push(`name:${name}|`); // city unknown at this stage for most sources; matches on name alone as a fallback
  return keys;
}

export function dedupeAgainstExisting(places, existingKeys) {
  if (!existingKeys || existingKeys.size === 0) return places;
  return (places || []).filter((place) => !placeDedupKeys(place).some((k) => existingKeys.has(k)));
}

export default { scoreProspectResults, buildExistingProspectKeys, dedupeAgainstExisting };
