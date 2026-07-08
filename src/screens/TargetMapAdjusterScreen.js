import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { COLORS } from '../constants';
import {
  buildConfirmedTargetFields,
  getCapturePoint,
  getProjectedTargetPoint,
} from '../utils/geoTargetConfirmation';
import useToast from '../hooks/useToast';

function isValidPoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude))
  );
}

function buildRegion(points = []) {
  const valid = points.filter(isValidPoint);

  if (!valid.length) {
    return {
      latitude: 29.7604,
      longitude: -95.3698,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }

  const latitudes = valid.map((p) => Number(p.latitude));
  const longitudes = valid.map((p) => Number(p.longitude));

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.005, Math.abs(maxLat - minLat) * 2.2 || 0.01),
    longitudeDelta: Math.max(0.005, Math.abs(maxLon - minLon) * 2.2 || 0.01),
  };
}

export default function TargetMapAdjusterScreen({ navigation, route }) {
  const lead = route?.params?.lead || {};
  const user = route?.params?.user || {};
  const returnScreen = route?.params?.returnScreen || 'Review';
  const editIdx = route?.params?.editIdx ?? null;

  const capturePoint = useMemo(() => getCapturePoint(lead), [lead]);
  const projectedPoint = useMemo(() => getProjectedTargetPoint(lead), [lead]);

  const initialTarget =
    lead.confirmed_target_latitude && lead.confirmed_target_longitude
      ? {
          latitude: Number(lead.confirmed_target_latitude),
          longitude: Number(lead.confirmed_target_longitude),
        }
      : projectedPoint || capturePoint;

  const [selectedTarget, setSelectedTarget] = useState(initialTarget);
  const { showToast } = useToast();

  const region = useMemo(
    () => buildRegion([capturePoint, projectedPoint, selectedTarget]),
    [capturePoint, projectedPoint, selectedTarget]
  );

  const confirmSelectedTarget = () => {
    if (!isValidPoint(selectedTarget)) {
      showToast('Target needed: Tap the map to choose a target location.', 'error');
      return;
    }

    const confirmedFields = buildConfirmedTargetFields({
      lead,
      latitude: selectedTarget.latitude,
      longitude: selectedTarget.longitude,
      source: 'map_adjusted_target',
      note: 'Confirmed from map adjuster.',
    });

    const updatedLead = {
      ...lead,
      ...confirmedFields,
    };

    navigation.navigate(returnScreen, {
      user,
      lead: updatedLead,
      editIdx,
      targetConfirmationFields: confirmedFields,
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Text style={styles.headerButtonText}>‹ Back</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Adjust Target</Text>
          <Text style={styles.subtitle}>Tap the map or drag the green pin.</Text>
        </View>

        <TouchableOpacity style={styles.confirmButton} onPress={confirmSelectedTarget}>
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </TouchableOpacity>
      </View>

      <MapView
        style={styles.map}
        initialRegion={region}
        onPress={(event) => {
          const coordinate = event?.nativeEvent?.coordinate;
          if (coordinate) {
            setSelectedTarget({
              latitude: Number(coordinate.latitude),
              longitude: Number(coordinate.longitude),
            });
          }
        }}
      >
        {capturePoint && (
          <Marker
            coordinate={capturePoint}
            title="Capture Location"
            description="Where the lead was captured"
            pinColor="#00c9ff"
          />
        )}

        {projectedPoint && (
          <Marker
            coordinate={projectedPoint}
            title="Projected Target"
            description="Original projected target estimate"
            pinColor="#a78bfa"
          />
        )}

        {selectedTarget && (
          <Marker
            coordinate={selectedTarget}
            title="Confirmed Target"
            description="Drag or tap map to move this pin"
            pinColor="#22c55e"
            draggable
            onDragEnd={(event) => {
              const coordinate = event?.nativeEvent?.coordinate;
              if (coordinate) {
                setSelectedTarget({
                  latitude: Number(coordinate.latitude),
                  longitude: Number(coordinate.longitude),
                });
              }
            }}
          />
        )}

        {capturePoint && selectedTarget && (
          <Polyline
            coordinates={[capturePoint, selectedTarget]}
            strokeWidth={3}
            strokeColor="rgba(0,201,255,0.85)"
          />
        )}
      </MapView>

      <View style={styles.legend}>
        <Text style={styles.legendItem}>Blue: capture point</Text>
        <Text style={styles.legendItem}>Purple: projected target</Text>
        <Text style={styles.legendItem}>Green: confirmed target</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerButton: { paddingHorizontal: 8, paddingVertical: 8 },
  headerButtonText: { color: COLORS.text, fontWeight: '900', fontSize: 16 },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  subtitle: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  confirmButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: COLORS.accent,
  },
  confirmButtonText: { color: '#000', fontWeight: '900', fontSize: 12 },
  map: { flex: 1 },
  legend: {
    padding: 10,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 3,
  },
  legendItem: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
});
