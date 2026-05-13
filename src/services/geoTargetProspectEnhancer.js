import { createGeoTargetSnapshot } from '../utils/geoTargetLocation';
import { attachGeoTargetToLead } from '../utils/geoTargetLeadMapper';

export async function enhanceProspectWithGeoTarget(prospect, options = {}) {
  const {
    includeAddress = true,
    requireHighAccuracy = false,
    jsonColumnName = 'geotarget',
  } = options;

  const geoTarget = await createGeoTargetSnapshot({
    includeAddress,
    requireHighAccuracy,
  });

  return attachGeoTargetToLead(prospect, geoTarget, { jsonColumnName });
}

export async function enhanceLeadWithGeoTarget(lead, options = {}) {
  return enhanceProspectWithGeoTarget(lead, options);
}
