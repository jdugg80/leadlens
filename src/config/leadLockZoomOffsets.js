export const LEADLOCK_ZOOM_LEVELS = [
  {
    label: '1×',
    displayZoom: 1,
    value: 0.0,
    distMin: 5,
    distMax: 30,
    offsetFeet: 25,
    searchRadiusFeet: 120,
    minimumConfidence: 72,
    targetLabel: '1x nearby',
  },
  {
    label: '2×',
    displayZoom: 2,
    value: 0.25,
    distMin: 30,
    distMax: 80,
    offsetFeet: 60,
    searchRadiusFeet: 160,
    minimumConfidence: 70,
    targetLabel: '2x short offset',
  },
  {
    label: '3×',
    displayZoom: 3,
    value: 0.5,
    distMin: 80,
    distMax: 200,
    offsetFeet: 100,
    searchRadiusFeet: 220,
    minimumConfidence: 68,
    targetLabel: '3x storefront offset',
  },
  {
    label: '5×',
    displayZoom: 5,
    value: 0.75,
    distMin: 200,
    distMax: 400,
    offsetFeet: 175,
    searchRadiusFeet: 300,
    minimumConfidence: 65,
    targetLabel: '5x parking lot offset',
  },
  {
    label: '10×',
    displayZoom: 10,
    value: 0.85,
    distMin: 400,
    distMax: 700,
    offsetFeet: 325,
    searchRadiusFeet: 475,
    minimumConfidence: 60,
    targetLabel: '10x far storefront offset',
  },
  {
    label: '15×',
    displayZoom: 15,
    value: 0.92,
    distMin: 700,
    distMax: 1200,
    offsetFeet: 500,
    searchRadiusFeet: 650,
    minimumConfidence: 56,
    targetLabel: '15x long offset',
  },
  {
    label: '20×',
    displayZoom: 20,
    value: 1.0,
    distMin: 1200,
    distMax: 2000,
    offsetFeet: 700,
    searchRadiusFeet: 850,
    minimumConfidence: 52,
    targetLabel: '20x max offset',
  },
];

export function getLeadLockZoomConfig(zoomLevelOrLabel = 1) {
  const normalized = String(zoomLevelOrLabel || '1').replace('×', '').replace('x', '').trim();
  const numericZoom = Number(normalized);

  if (Number.isFinite(numericZoom)) {
    const exact = LEADLOCK_ZOOM_LEVELS.find((item) => item.displayZoom === numericZoom);
    if (exact) return exact;

    return LEADLOCK_ZOOM_LEVELS.reduce((closest, current) => {
      const currentDiff = Math.abs(current.displayZoom - numericZoom);
      const closestDiff = Math.abs(closest.displayZoom - numericZoom);
      return currentDiff < closestDiff ? current : closest;
    }, LEADLOCK_ZOOM_LEVELS[0]);
  }

  return LEADLOCK_ZOOM_LEVELS[0];
}

export function clampLeadLockZoomLevel(zoomLevel = 1) {
  return Math.max(1, Math.min(20, Number(zoomLevel || 1)));
}

export function formatLeadLockZoomLabel(zoomLevel = 1) {
  const zoom = clampLeadLockZoomLevel(zoomLevel);
  return zoom % 1 === 0 ? `${zoom.toFixed(0)}×` : `${zoom.toFixed(1)}×`;
}

export function getDynamicLeadLockZoomConfig(zoomLevel = 1) {
  const zoom = clampLeadLockZoomLevel(zoomLevel);
  const sorted = [...LEADLOCK_ZOOM_LEVELS].sort((a, b) => a.displayZoom - b.displayZoom);
  const exact = sorted.find((item) => item.displayZoom === zoom);
  if (exact) return exact;

  const lower = [...sorted].reverse().find((item) => item.displayZoom < zoom);
  const upper = sorted.find((item) => item.displayZoom > zoom);
  if (!lower) return sorted[0];
  if (!upper) return sorted[sorted.length - 1];

  const range = upper.displayZoom - lower.displayZoom;
  const progress = range === 0 ? 0 : (zoom - lower.displayZoom) / range;
  const lerp = (a, b) => a + (b - a) * progress;

  return {
    label: formatLeadLockZoomLabel(zoom),
    displayZoom: zoom,
    value: Math.max(0, Math.min(1, lerp(lower.value, upper.value))),
    distMin: Math.round(lerp(lower.distMin, upper.distMin)),
    distMax: Math.round(lerp(lower.distMax, upper.distMax)),
    offsetFeet: Math.round(lerp(lower.offsetFeet, upper.offsetFeet)),
    searchRadiusFeet: Math.round(lerp(lower.searchRadiusFeet, upper.searchRadiusFeet)),
    minimumConfidence: Math.round(lerp(lower.minimumConfidence, upper.minimumConfidence)),
    targetLabel: `${zoom.toFixed(1)}x dynamic offset`,
  };
}

export function getNearestPresetLeadLockZoom(zoomLevel = 1) {
  const zoom = clampLeadLockZoomLevel(zoomLevel);
  return LEADLOCK_ZOOM_LEVELS.reduce((closest, current) => {
    const currentDiff = Math.abs(current.displayZoom - zoom);
    const closestDiff = Math.abs(closest.displayZoom - zoom);
    return currentDiff < closestDiff ? current : closest;
  }, LEADLOCK_ZOOM_LEVELS[0]);
}
