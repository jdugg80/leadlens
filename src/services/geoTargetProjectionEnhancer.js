import {
  createTargetProjection,
  extractProjectionInputFromLead,
} from '../utils/geoTargetProjection';

export function mapProjectionToLeadFields(projection = {}) {
  if (!projection?.ok) {
    return {
      target_projection_status: projection?.status?.label || 'Projection Unavailable',
      target_projection_confidence: null,
      target_projection_error: projection?.reason || 'Projection unavailable.',
    };
  }

  return {
    target_latitude: projection.targetLatitude,
    target_longitude: projection.targetLongitude,
    target_bearing_degrees: projection.targetBearingDegrees,
    target_distance_meters: projection.targetDistanceMeters,
    target_projection_confidence: projection.targetProjectionConfidence,
    target_projection_status: projection.targetProjectionStatus,
    target_projection_level: projection.targetProjectionLevel,
    target_distance_source: projection.distanceSource,
    target_distance_confirmed: !!projection.hasUserConfirmedDistance,
    target_projection_calculated_at: projection.calculatedAt,
    target_projection: projection,
  };
}

export async function enhanceLeadWithTargetProjection(lead = {}, options = {}) {
  const {
    fallbackDistanceMeters = 125,
    distanceMeters,
    distanceSource = distanceMeters ? 'manual' : 'default_estimate',
    hasUserConfirmedDistance = false,
  } = options;

  const input = extractProjectionInputFromLead(
    lead,
    distanceMeters ?? fallbackDistanceMeters
  );

  const projection = createTargetProjection({
    captureLatitude: input.captureLatitude,
    captureLongitude: input.captureLongitude,
    headingDegrees: input.headingDegrees,
    headingAccuracy: input.headingAccuracy,
    captureAccuracyMeters: input.captureAccuracyMeters,
    distanceMeters: input.distanceMeters,
    distanceSource,
    hasUserConfirmedDistance,
  });

  return {
    ...lead,
    ...mapProjectionToLeadFields(projection),
  };
}
