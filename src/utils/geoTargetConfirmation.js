function toRad(degrees) {
  return (Number(degrees) * Math.PI) / 180;
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

export function distanceMetersBetweenPoints(pointA = {}, pointB = {}) {
  const lat1 = Number(pointA.latitude);
  const lon1 = Number(pointA.longitude);
  const lat2 = Number(pointB.latitude);
  const lon2 = Number(pointB.longitude);

  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    return null;
  }

  const earthRadiusMeters = 6378137;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusMeters * c);
}

export function getProjectedTargetPoint(lead = {}) {
  const projection = lead.target_projection || lead.targetProjection || {};

  const latitude =
    lead.target_latitude ??
    lead.targetLatitude ??
    projection.targetLatitude ??
    projection.target_latitude ??
    null;

  const longitude =
    lead.target_longitude ??
    lead.targetLongitude ??
    projection.targetLongitude ??
    projection.target_longitude ??
    null;

  if (!isValidCoordinate(latitude, longitude)) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
}

export function getCapturePoint(lead = {}) {
  const geoTarget = lead.geotarget || lead.geoTarget || {};
  const bestFix = geoTarget.bestFix || {};

  const latitude =
    lead.capture_latitude ??
    lead.captureLatitude ??
    bestFix.latitude ??
    geoTarget.latitude ??
    null;

  const longitude =
    lead.capture_longitude ??
    lead.captureLongitude ??
    bestFix.longitude ??
    geoTarget.longitude ??
    null;

  if (!isValidCoordinate(latitude, longitude)) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
}

export function buildConfirmedTargetFields({
  lead = {},
  latitude,
  longitude,
  source = 'projected_target_confirmed',
  note = '',
} = {}) {
  const confirmedPoint = {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };

  if (!isValidCoordinate(confirmedPoint.latitude, confirmedPoint.longitude)) {
    return {
      target_confirmed: false,
      confirmed_target_error: 'Invalid confirmed target coordinates.',
    };
  }

  const projectedPoint = getProjectedTargetPoint(lead);
  const capturePoint = getCapturePoint(lead);

  const correctionDistanceMeters = projectedPoint
    ? distanceMetersBetweenPoints(projectedPoint, confirmedPoint)
    : null;

  const captureToConfirmedDistanceMeters = capturePoint
    ? distanceMetersBetweenPoints(capturePoint, confirmedPoint)
    : null;

  return {
    target_confirmed: true,
    confirmed_target_latitude: confirmedPoint.latitude,
    confirmed_target_longitude: confirmedPoint.longitude,
    confirmed_target_source: source,
    confirmed_target_note: note || '',
    target_confirmed_at: new Date().toISOString(),
    target_correction_distance_meters: correctionDistanceMeters,
    capture_to_confirmed_target_meters: captureToConfirmedDistanceMeters,
    confirmed_target_error: null,
  };
}

export function confirmProjectedTarget(lead = {}, note = '') {
  const projectedPoint = getProjectedTargetPoint(lead);

  if (!projectedPoint) {
    return {
      ...lead,
      target_confirmed: false,
      confirmed_target_error: 'No projected target point is available to confirm.',
    };
  }

  return {
    ...lead,
    ...buildConfirmedTargetFields({
      lead,
      latitude: projectedPoint.latitude,
      longitude: projectedPoint.longitude,
      source: 'projected_target_confirmed',
      note,
    }),
  };
}

export function confirmCapturePointAsTarget(lead = {}, note = '') {
  const capturePoint = getCapturePoint(lead);

  if (!capturePoint) {
    return {
      ...lead,
      target_confirmed: false,
      confirmed_target_error: 'No capture point is available to confirm.',
    };
  }

  return {
    ...lead,
    ...buildConfirmedTargetFields({
      lead,
      latitude: capturePoint.latitude,
      longitude: capturePoint.longitude,
      source: 'capture_point_confirmed',
      note,
    }),
  };
}

export function clearConfirmedTarget(lead = {}) {
  return {
    ...lead,
    target_confirmed: false,
    confirmed_target_latitude: null,
    confirmed_target_longitude: null,
    confirmed_target_source: null,
    confirmed_target_note: '',
    target_confirmed_at: null,
    target_correction_distance_meters: null,
    capture_to_confirmed_target_meters: null,
    confirmed_target_error: null,
  };
}
