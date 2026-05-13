const FEET_TO_METERS = 0.3048;
const EARTH_RADIUS_METERS = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

export function normalizeHeadingDegrees(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

export function getBestHeadingDegrees(heading) {
  if (!heading) return null;
  const trueHeading = normalizeHeadingDegrees(heading.trueHeading);
  if (trueHeading !== null && trueHeading >= 0) return trueHeading;
  const magHeading = normalizeHeadingDegrees(heading.magHeading);
  if (magHeading !== null && magHeading >= 0) return magHeading;
  return null;
}

export function projectPointFromHeading({ origin, headingDegrees, offsetFeet }) {
  const heading = normalizeHeadingDegrees(headingDegrees);
  if (heading === null) return null;

  const latitude = Number(origin?.latitude);
  const longitude = Number(origin?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const offsetMeters = Math.max(0, Number(offsetFeet || 0) * FEET_TO_METERS);
  if (offsetMeters <= 0) {
    return {
      origin: { latitude, longitude },
      target: { latitude, longitude },
      headingDegrees: heading,
      adjustedHeadingDegrees: heading,
      offsetFeet: 0,
      offsetMeters: 0,
    };
  }

  const bearing = toRad(heading);
  const lat1 = toRad(latitude);
  const lon1 = toRad(longitude);
  const angularDistance = offsetMeters / EARTH_RADIUS_METERS;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    origin: { latitude, longitude },
    target: { latitude: toDeg(lat2), longitude: toDeg(lon2) },
    headingDegrees: heading,
    adjustedHeadingDegrees: heading,
    offsetFeet,
    offsetMeters,
  };
}

export function getTargetBoxAimOffsetDegrees(targetBox) {
  if (!targetBox) return 0;

  const centerX = Number(targetBox.normalizedCenterX ?? 0.5);
  if (!Number.isFinite(centerX)) return 0;

  // A rough rear-camera horizontal field of view. Good enough for steering the search cone.
  const estimatedHorizontalFovDegrees = 62;
  const offsetFromCenter = Math.max(-0.5, Math.min(0.5, centerX - 0.5));
  return offsetFromCenter * estimatedHorizontalFovDegrees;
}
