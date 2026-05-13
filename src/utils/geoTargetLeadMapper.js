export function mapGeoTargetToLeadFields(geoTarget) {
  const bestFix = geoTarget?.bestFix;

  return {
    capture_latitude: bestFix?.latitude ?? null,
    capture_longitude: bestFix?.longitude ?? null,
    capture_accuracy_meters: bestFix?.accuracyMeters ?? null,
    capture_location_confidence: bestFix?.confidence ?? null,
    capture_location_status: geoTarget?.status?.label ?? null,
    capture_location_source: bestFix?.source ?? null,
    capture_heading_true: geoTarget?.heading?.trueHeading ?? null,
    capture_heading_magnetic: geoTarget?.heading?.magneticHeading ?? null,
    capture_location_captured_at: geoTarget?.capturedAt ?? null,
  };
}

export function attachGeoTargetToLead(lead, geoTarget, options = {}) {
  const { jsonColumnName = 'geotarget' } = options;
  const safeLead = lead && typeof lead === 'object' ? lead : {};
  const geoTargetFields = mapGeoTargetToLeadFields(geoTarget);

  return {
    ...safeLead,
    ...geoTargetFields,
    [jsonColumnName]: geoTarget ?? null,
  };
}
