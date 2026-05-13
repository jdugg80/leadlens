import { getLeadLockZoomConfig } from '../config/leadLockZoomOffsets';
import {
  getBestHeadingDegrees,
  getTargetBoxAimOffsetDegrees,
  normalizeHeadingDegrees,
  projectPointFromHeading,
} from './leadLockGeoProjection';

export function buildLeadLockTarget({ coords, heading, zoomLevel, targetBox }) {
  const origin = {
    latitude: Number(coords?.latitude),
    longitude: Number(coords?.longitude),
    accuracy: coords?.accuracy ?? null,
  };

  const zoomConfig = getLeadLockZoomConfig(zoomLevel?.displayZoom || zoomLevel?.label || zoomLevel || 1);
  const baseHeading = getBestHeadingDegrees(heading);
  const aimOffsetDegrees = getTargetBoxAimOffsetDegrees(targetBox);
  const adjustedHeading =
    baseHeading === null ? null : normalizeHeadingDegrees(baseHeading + aimOffsetDegrees);

  const projection =
    adjustedHeading === null
      ? null
      : projectPointFromHeading({
          origin,
          headingDegrees: adjustedHeading,
          offsetFeet: zoomConfig.offsetFeet,
        });

  const target = projection?.target || { latitude: origin.latitude, longitude: origin.longitude };

  return {
    origin,
    target,
    zoomConfig,
    projection,
    usedOffset: !!projection,
    targetBox: targetBox || null,
    debug: {
      origin,
      target,
      zoomLabel: zoomConfig.label,
      displayZoom: zoomConfig.displayZoom,
      offsetFeet: zoomConfig.offsetFeet,
      searchRadiusFeet: zoomConfig.searchRadiusFeet,
      minimumConfidence: zoomConfig.minimumConfidence,
      baseHeading,
      aimOffsetDegrees,
      adjustedHeading,
      usedOffset: !!projection,
      hasTargetBox: !!targetBox,
    },
  };
}
