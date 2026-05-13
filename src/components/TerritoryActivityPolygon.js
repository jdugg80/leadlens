import React from 'react';
import { Polygon } from 'react-native-maps';
import { getStaticTerritoryPolygonStyle } from '../utils/territoryActivityColors';

export default function TerritoryActivityPolygon({
  coordinates,
  activityLevel,
  strokeWidth,
  onPress,
  tappable = true,
  zIndex,
  geodesic = false,
}) {
  const style = getStaticTerritoryPolygonStyle(activityLevel);

  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    return null;
  }

  return (
    <Polygon
      coordinates={coordinates}
      fillColor={style.fillColor}
      strokeColor={style.strokeColor}
      strokeWidth={typeof strokeWidth === 'number' ? strokeWidth : style.strokeWidth}
      tappable={tappable}
      onPress={onPress}
      zIndex={zIndex}
      geodesic={geodesic}
    />
  );
}
