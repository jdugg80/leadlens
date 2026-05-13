import { enhanceLeadWithTargetProjection } from '../services/geoTargetProjectionEnhancer';

function lower(value) {
  return String(value || '').toLowerCase();
}

function includesAny(value, terms = []) {
  const text = lower(value);
  return terms.some((term) => text.includes(lower(term)));
}

function getCaptureAccuracyMeters(lead = {}) {
  const value =
    lead.capture_accuracy_meters ??
    lead.captureAccuracyMeters ??
    lead.geotarget?.bestFix?.accuracyMeters ??
    lead.geoTarget?.bestFix?.accuracyMeters ??
    null;

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getHeadingDegrees(lead = {}) {
  const value =
    lead.capture_heading_true ??
    lead.captureHeadingTrue ??
    lead.capture_heading_magnetic ??
    lead.captureHeadingMagnetic ??
    lead.geotarget?.heading?.trueHeading ??
    lead.geoTarget?.heading?.trueHeading ??
    lead.geotarget?.heading?.magneticHeading ??
    lead.geoTarget?.heading?.magneticHeading ??
    null;

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getReviewText(lead = {}) {
  return [
    lead.captureMethod,
    lead.capture_method,
    lead.captureSourceType,
    lead.source_type,
    lead.locationSource,
    lead.ocrSummary,
    lead.matchedDisplayName,
    lead.vertical,
    lead.industry,
    lead.businessType,
    ...(Array.isArray(lead.reviewLabels) ? lead.reviewLabels : []),
  ]
    .filter(Boolean)
    .map(String)
    .join(' ');
}

export function getAutoDistanceChoice(lead = {}) {
  const captureAccuracy = getCaptureAccuracyMeters(lead);
  const heading = getHeadingDegrees(lead);
  const reviewText = getReviewText(lead);

  const hasHeading = Number.isFinite(heading);
  const hasStrongGps = captureAccuracy !== null && captureAccuracy <= 25;
  const hasGoodGps = captureAccuracy !== null && captureAccuracy <= 50;

  const isBusinessCard = includesAny(reviewText, [
    'business card',
    'business_card',
    'card',
    'contact card',
  ]);

  const isLargeProperty = includesAny(reviewText, [
    'warehouse',
    'industrial',
    'distribution',
    'logistics',
    'manufacturing',
    'plant',
    'facility',
    'yard',
    'storage',
    'terminal',
  ]);

  const isMultiTenant = includesAny(reviewText, [
    'shopping center',
    'shopping_center',
    'strip center',
    'strip_center',
    'suite',
    'unit',
    'multiple',
    'multi',
    'plaza',
    'retail center',
  ]);

  const hasPlaceMatch = !!(
    lead.matchedDisplayName ||
    lead.placeId ||
    lead.googlePlaceId ||
    lead.place_id
  );

  const hasStorefrontClues = includesAny(reviewText, [
    'storefront',
    'sign',
    'ocr',
    'image',
    'photo',
    'ai extracted',
    'matched place',
  ]);

  if (isBusinessCard) {
    return {
      key: 'auto_card_close',
      label: 'Auto Close',
      distanceMeters: 10,
      reason: 'business_card_close_capture',
    };
  }

  if (isLargeProperty) {
    return {
      key: 'auto_far_lot',
      label: 'Auto Far Lot',
      distanceMeters: 250,
      reason: 'large_property_or_industrial',
    };
  }

  if (isMultiTenant) {
    return {
      key: 'auto_across_lot',
      label: 'Auto Across Lot',
      distanceMeters: 125,
      reason: 'multi_tenant_or_shopping_center',
    };
  }

  if (hasStrongGps && hasHeading && (hasPlaceMatch || hasStorefrontClues)) {
    return {
      key: 'auto_near',
      label: 'Auto Near',
      distanceMeters: 25,
      reason: 'strong_gps_heading_storefront_clues',
    };
  }

  if (hasGoodGps && hasHeading) {
    return {
      key: 'auto_across_street',
      label: 'Auto Across Street',
      distanceMeters: 50,
      reason: 'good_gps_heading_default',
    };
  }

  if (hasHeading) {
    return {
      key: 'auto_across_lot',
      label: 'Auto Across Lot',
      distanceMeters: 125,
      reason: 'heading_available_default_lot',
    };
  }

  return {
    key: 'auto_gps_only',
    label: 'GPS Only',
    distanceMeters: null,
    reason: 'missing_reliable_heading',
  };
}

export function getTargetConfidenceLabel(score) {
  const value = Number(score);

  if (!Number.isFinite(value)) return 'GPS Only';
  if (value >= 85) return 'Strong Auto Estimate';
  if (value >= 70) return 'Good Auto Estimate';
  if (value >= 50) return 'Approximate Auto Estimate';

  return 'Low Confidence Estimate';
}

export function shouldRecommendTargetReview(lead = {}) {
  const score = Number(lead.target_projection_confidence);
  const status = lower(lead.target_projection_status);

  if (status.includes('unavailable')) return true;
  if (!Number.isFinite(score)) return true;

  return score < 50;
}

export function isUserDistanceOverride(lead = {}) {
  const source = lower(lead.target_distance_source || lead.targetDistanceSource);
  return source.startsWith('user_') || source === 'manual';
}

export async function applyAutoTargetModeToLead(lead = {}, options = {}) {
  const { forceAuto = false } = options;

  if (!forceAuto && isUserDistanceOverride(lead)) {
    const projected = await enhanceLeadWithTargetProjection(lead, {
      distanceMeters: lead.target_distance_meters ?? lead.targetDistanceMeters ?? 125,
      distanceSource: lead.target_distance_source || 'user_preset',
      hasUserConfirmedDistance: !!lead.target_distance_confirmed,
    });

    return {
      ...projected,
      target_auto_mode: false,
      target_auto_reason: 'user_distance_override',
      target_confidence_label: getTargetConfidenceLabel(projected.target_projection_confidence),
      target_review_recommended: shouldRecommendTargetReview(projected),
      target_resolution_source: projected.target_latitude ? 'user_projection' : 'capture_gps',
    };
  }

  const choice = getAutoDistanceChoice(lead);

  const leadWithAuto = {
    ...lead,
    target_auto_mode: true,
    target_auto_reason: choice.reason,
    target_distance_key: choice.key,
    target_distance_label: choice.label,
    target_distance_meters: choice.distanceMeters,
    target_distance_custom_meters: null,
    target_distance_source: 'auto_estimate',
    target_distance_confirmed: false,
    target_auto_selected_at: new Date().toISOString(),
  };

  if (!choice.distanceMeters) {
    return {
      ...leadWithAuto,
      target_latitude: null,
      target_longitude: null,
      target_projection_confidence: null,
      target_projection_status: 'Projection Unavailable',
      target_projection_level: 'none',
      target_projection_error: 'Auto mode skipped projection because heading or target distance was unavailable.',
      target_confidence_label: 'GPS Only',
      target_review_recommended: true,
      target_resolution_source: 'capture_gps',
    };
  }

  const projected = await enhanceLeadWithTargetProjection(leadWithAuto, {
    distanceMeters: choice.distanceMeters,
    distanceSource: 'auto_estimate',
    hasUserConfirmedDistance: false,
  });

  return {
    ...projected,
    target_auto_mode: true,
    target_auto_reason: choice.reason,
    target_distance_key: choice.key,
    target_distance_label: choice.label,
    target_distance_meters: choice.distanceMeters,
    target_distance_source: 'auto_estimate',
    target_distance_confirmed: false,
    target_confidence_label: getTargetConfidenceLabel(projected.target_projection_confidence),
    target_review_recommended: shouldRecommendTargetReview(projected),
    target_resolution_source: projected.target_latitude ? 'auto_projection' : 'capture_gps',
    target_auto_selected_at: leadWithAuto.target_auto_selected_at,
  };
}
