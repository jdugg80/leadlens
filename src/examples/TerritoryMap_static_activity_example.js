/*
Use this example inside your existing Territory Map screen.

The important part:
- remove pulse Animated.loop / ripple / halo overlay logic
- use TerritoryActivityPolygon or the static color helpers
*/

import React from 'react';
import MapView from 'react-native-maps';
import TerritoryActivityPolygon from '../components/TerritoryActivityPolygon';

export default function TerritoryMapStaticActivityExample({ territoryPolygons = [], onPolygonPress }) {
  return (
    <MapView style={{ flex: 1 }}>
      {territoryPolygons.map((territory) => (
        <TerritoryActivityPolygon
          key={territory.id || territory.zip || JSON.stringify(territory.coordinates)}
          coordinates={territory.coordinates}
          activityLevel={territory.activityLevel || territory.activity_score || territory.activity}
          onPress={() => onPolygonPress?.(territory)}
        />
      ))}
    </MapView>
  );
}
