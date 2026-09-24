import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { showThemedAlert } from '../components/ThemedAlert';
import { buildGoogleMapsRouteUrl } from '../utils/addressListImport';
import { addSavedRoute, buildRouteRecord } from '../utils/savedRoutes';
import { Linking } from 'react-native';

// Kept as a standalone screen for now rather than merged into
// TerritoryMapScreen.js (which is a much larger, more complex screen) —
// the plan is to fold route plotting into that screen during its planned
// revamp, at which point this becomes one map instead of two.

export default function RoutePreviewScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const { stops = [], startCoords, sourceLabel = 'Route' } = route?.params || {};

  useEffect(() => {
    if (!mapRef.current || !stops.length || !startCoords) return;
    const coords = [
      { latitude: startCoords.latitude, longitude: startCoords.longitude },
      ...stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    ];
    // Small delay so the map has finished its initial layout before fitting.
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [stops, startCoords]);

  const handleRunRoute = () => {
    if (!startCoords || !stops.length) return;
    const url = buildGoogleMapsRouteUrl(startCoords, stops);
    if (url) Linking.openURL(url);
  };

  const handleSaveForLater = () => {
    showThemedAlert(
      'Save Route',
      `Save this ${stops.length}-stop route to run later?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async () => {
            setSaving(true);
            try {
              const record = buildRouteRecord({ name: sourceLabel, stops, startCoords });
              await addSavedRoute(record);
              showThemedAlert('Route saved', 'You can run this route later from Saved Routes.');
              navigation.goBack();
            } catch (err) {
              showThemedAlert('Save failed', err?.message || 'Could not save this route.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  if (!stops.length || !startCoords) {
    return (
      <View style={[s.root, s.centerContent]}>
        <Text style={s.emptyText}>No route data to show.</Text>
        <TouchableOpacity style={s.backBtnFallback} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnFallbackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initialRegion = {
    latitude: startCoords.latitude,
    longitude: startCoords.longitude,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
  };

  const polylineCoords = [
    { latitude: startCoords.latitude, longitude: startCoords.longitude },
    ...stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
  ];

  return (
    <View style={s.root}>
      <MapView
        ref={mapRef}
        style={s.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
      >
        <Marker
          coordinate={{ latitude: startCoords.latitude, longitude: startCoords.longitude }}
          title="Start"
          pinColor="#00C9FF"
        />
        {stops.map((stop, idx) => (
          <Marker
            key={`${stop.latitude},${stop.longitude},${idx}`}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            title={`${idx + 1}. ${stop.businessName || stop.rawAddress || 'Stop'}`}
            description={stop.rawAddress}
          />
        ))}
        <Polyline
          coordinates={polylineCoords}
          strokeColor="#00C9FF"
          strokeWidth={3}
        />
      </MapView>

      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Route Preview</Text>
          <Text style={s.headerSubtitle}>{stops.length} stop{stops.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      <View style={[s.actionBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[s.actionBtn, s.saveBtn]}
          onPress={handleSaveForLater}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={COLORS.accent} />
            : <Text style={s.saveBtnText}>Save for Later</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, s.runBtn]} onPress={handleRunRoute}>
          <Text style={s.runBtnText}>Run Route</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  centerContent: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  map: { ...StyleSheet.absoluteFillObject },

  header: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(8,10,15,0.85)',
    gap: 12,
  },
  backBtn: { padding: 4 },
  backBtnText: { color: COLORS.accent, fontSize: 24, fontWeight: '700' },
  headerTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 2 },

  actionBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'rgba(8,10,15,0.92)',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderLit },
  saveBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  runBtn: { backgroundColor: COLORS.accent },
  runBtnText: { color: COLORS.bg, fontWeight: '800', fontSize: 14 },

  emptyText: { color: COLORS.muted, fontSize: 14, marginBottom: 16 },
  backBtnFallback: {
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: COLORS.surface2, borderRadius: 10,
  },
  backBtnFallbackText: { color: COLORS.accent, fontWeight: '700' },
});
