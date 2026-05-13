/**
 * GeoTarget Assist Phase 2
 * Camera heading + target projection helpers.
 *
 * This projects an estimated target point from:
 * - capture latitude/longitude
 * - camera/device heading
 * - user-selected or estimated distance
 */

const EARTH_RADIUS_METERS = 6378137;

function toRad(degrees) {
  return (Number(degrees) * Math.PI) / 180;
}

function toDeg(radians) {
  return (Number(radians) * 180) / Math.PI;
}

export function normalizeBearing(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

export function isValidCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function projectPointFromBearingDistance({
  latitude,
  longitude,
  bearingDegrees,
  distanceMeters,
}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  const bearing = normalizeBearing(bearingDegrees);
  const distance = Number(distanceMeters);

  if (!isValidCoordinate(lat, lon)) return null;
  if (!Number.isFinite(bearing) || !Number.isFinite(distance) || distance <= 0) return null;

  const angularDistance = distance / EARTH_RADIUS_METERS;
  const bearingRad = toRad(bearing);
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: toDeg(lat2),
    longitude: ((toDeg(lon2) + 540) % 360) - 180,
    bearingDegrees: bearing,
    distanceMeters: distance,
  };
}

export function getProjectionConfidence({
  captureAccuracyMeters,
  headingAccuracy,
  distanceMeters,
  hasUserConfirmedDistance = false,
}) {
  const accuracy = Number(captureAccuracyMeters);
  const headingAcc = Number(headingAccuracy);
  const distance = Number(distanceMeters);

  let score = 50;

  if (Number.isFinite(accuracy)) {
    if (accuracy <= 10) score += 25;
    else if (accuracy <= 25) score += 18;
    else if (accuracy <= 50) score += 10;
    else if (accuracy <= 100) score += 2;
    else score -= 15;
  } else {
    score -= 15;
  }

  if (Number.isFinite(headingAcc)) {
    if (headingAcc <= 10) score += 15;
    else if (headingAcc <= 25) score += 8;
    else if (headingAcc <= 45) score += 2;
    else score -= 10;
  } else {
    score -= 5;
  }

  if (Number.isFinite(distance)) {
    if (distance <= 75) score += 10;
    else if (distance <= 200) score += 5;
    else if (distance <= 500) score -= 5;
    else score -= 15;
  } else {
    score -= 20;
  }

  if (hasUserConfirmedDistance) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getProjectionStatus(confidence) {
  const score = Number(confidence);

  if (!Number.isFinite(score)) return { label: 'Projection Unavailable', level: 'none' };
  if (score >= 85) return { label: 'Projected Target Lock', level: 'excellent' };
  if (score >= 70) return { label: 'Strong Target Estimate', level: 'good' };
  if (score >= 50) return { label: 'Approximate Target Estimate', level: 'fair' };

  return { label: 'Weak Target Estimate', level: 'poor' };
}

export function createTargetProjection({
  captureLatitude,
  captureLongitude,
  headingDegrees,
  headingAccuracy,
  captureAccuracyMeters,
  distanceMeters,
  distanceSource = 'manual_or_default',
  hasUserConfirmedDistance = false,
}) {
  const projected = projectPointFromBearingDistance({
    latitude: captureLatitude,
    longitude: captureLongitude,
    bearingDegrees: headingDegrees,
    distanceMeters,
  });

  if (!projected) {
    return {
      ok: false,
      status: { label: 'Projection Unavailable', level: 'none' },
      reason: 'Missing valid capture coordinate, heading, or distance.',
    };
  }

  const confidence = getProjectionConfidence({
    captureAccuracyMeters,
    headingAccuracy,
    distanceMeters,
    hasUserConfirmedDistance,
  });

  const status = getProjectionStatus(confidence);

  return {
    ok: true,
    targetLatitude: projected.latitude,
    targetLongitude: projected.longitude,
    targetBearingDegrees: projected.bearingDegrees,
    targetDistanceMeters: projected.distanceMeters,
    targetProjectionConfidence: confidence,
    targetProjectionStatus: status.label,
    targetProjectionLevel: status.level,
    distanceSource,
    hasUserConfirmedDistance,
    calculatedAt: new Date().toISOString(),
  };
}

export function extractProjectionInputFromLead(lead = {}, fallbackDistanceMeters = 125) {
  const geoTarget = lead.geotarget || lead.geoTarget || {};
  const bestFix = geoTarget.bestFix || {};
  const heading = geoTarget.heading || {};

  return {
    captureLatitude:
      lead.capture_latitude ??
      lead.captureLatitude ??
      bestFix.latitude ??
      geoTarget.latitude ??
      null,

    captureLongitude:
      lead.capture_longitude ??
      lead.captureLongitude ??
      bestFix.longitude ??
      geoTarget.longitude ??
      null,

    headingDegrees:
      lead.capture_heading_true ??
      lead.captureHeadingTrue ??
      heading.trueHeading ??
      lead.capture_heading_magnetic ??
      lead.captureHeadingMagnetic ??
      heading.magneticHeading ??
      bestFix.heading ??
      null,

    headingAccuracy:
      lead.capture_heading_accuracy ??
      lead.captureHeadingAccuracy ??
      heading.headingAccuracy ??
      null,

    captureAccuracyMeters:
      lead.capture_accuracy_meters ??
      lead.captureAccuracyMeters ??
      bestFix.accuracyMeters ??
      geoTarget.accuracyMeters ??
      null,

    distanceMeters:
      lead.target_distance_meters ??
      lead.targetDistanceMeters ??
      fallbackDistanceMeters,
  };
}
