
export const TARGET_DISTANCE_PRESETS = [
  { key: 'near', label: 'Near', shortLabel: 'Near', distanceMeters: 25, description: 'Same sidewalk or close storefront' },
  { key: 'across_street', label: 'Across Street', shortLabel: 'Street', distanceMeters: 50, description: 'Opposite side of road or small lot' },
  { key: 'across_lot', label: 'Across Lot', shortLabel: 'Lot', distanceMeters: 125, description: 'Typical parking lot or shopping center' },
  { key: 'far_lot', label: 'Far Lot', shortLabel: 'Far', distanceMeters: 250, description: 'Large commercial property or long lot' },
];
export const CUSTOM_DISTANCE_KEY = 'custom';
export function getDistancePresetByKey(key) { return TARGET_DISTANCE_PRESETS.find((preset) => preset.key === key) || null; }
export function getDefaultDistancePreset() { return TARGET_DISTANCE_PRESETS.find((preset) => preset.key === 'across_lot') || TARGET_DISTANCE_PRESETS[0]; }
export function normalizeDistanceMeters(value, fallback = 125) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.max(1, Math.min(5000, Math.round(numberValue)));
}
export function buildTargetDistanceFields(selection = {}) {
  const preset = getDistancePresetByKey(selection.key);
  const isCustom = selection.key === CUSTOM_DISTANCE_KEY;
  const distanceMeters = normalizeDistanceMeters(selection.distanceMeters ?? preset?.distanceMeters, getDefaultDistancePreset().distanceMeters);
  const label = selection.label || preset?.label || (isCustom ? 'Custom' : 'Across Lot');
  return {
    target_distance_key: selection.key || preset?.key || 'across_lot',
    target_distance_label: label,
    target_distance_meters: distanceMeters,
    target_distance_custom_meters: isCustom ? distanceMeters : null,
    target_distance_source: isCustom ? 'user_custom' : 'user_preset',
    target_distance_confirmed: true,
  };
}
