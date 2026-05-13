
import { buildTargetDistanceFields } from './geoTargetDistancePresets';
import { enhanceLeadWithTargetProjection } from '../services/geoTargetProjectionEnhancer';
export async function applyTargetDistanceToLead(lead = {}, selection = {}) {
  const distanceFields = buildTargetDistanceFields(selection);
  const leadWithDistance = { ...lead, ...distanceFields };
  return await enhanceLeadWithTargetProjection(leadWithDistance, {
    distanceMeters: distanceFields.target_distance_meters,
    distanceSource: distanceFields.target_distance_source,
    hasUserConfirmedDistance: true,
  });
}
