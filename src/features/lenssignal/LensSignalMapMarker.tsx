import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { LensSignalRecord } from './lenssignalTypes';
import { getSignalEmoji, getSignalMarkerColor, getAlertColor } from './lenssignalScoring';
import { TargetLensProfile } from '../../config/targetLensProfiles';

interface Props {
  signal: LensSignalRecord;
  onPress: (signal: LensSignalRecord) => void;
  activeProfile?: TargetLensProfile | null;
}

export const LensSignalMapMarker = ({ signal, onPress, activeProfile }: Props) => {
  const layer       = signal.signal_layer || signal.signal_type || '';

  // Use profile theme if active and not a special signal (opening/pest)
  const isSpecial   = layer === 'Opening Signal' || signal.pest_indicator;
  const markerColor = (activeProfile && !isSpecial && activeProfile.category !== 'Pest Control')
    ? activeProfile.themeColor
    : getSignalMarkerColor(signal);

  const emoji       = (activeProfile && !isSpecial && activeProfile.category !== 'Pest Control')
    ? activeProfile.icon
    : getSignalEmoji(signal);

  const isOpening   = layer === 'Opening Signal';
  const isPest      = signal.pest_indicator;
  const isPriority  = signal.alert_level === 'Priority Review';

  return (
    <Marker
      coordinate={{
        latitude:  Number(signal.latitude)  || 0,
        longitude: Number(signal.longitude) || 0,
      }}
      title={signal.establishment_name || signal.business_name || 'Signal'}
      description={layer + (signal.pest_details ? ' · ' + signal.pest_details : '')}
      onPress={() => {
        try {
          onPress(signal);
        } catch (e) {
          console.warn('[LensSignalMapMarker] onPress failed:', e);
        }
      }}
      tracksViewChanges={false}
    >
      <View style={styles.wrapper}>
        {/* Pulse ring for priority/pest signals */}
        {(isPriority || isPest) && (
          <View style={[styles.pulseRing, { borderColor: markerColor }]} />
        )}

        {/* Main marker bubble */}
        <View style={[
          styles.bubble,
          { backgroundColor: markerColor },
          isOpening && styles.bubbleOpening,
          isPriority && styles.bubblePriority,
        ]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>

        {/* Tail */}
        <View style={[styles.tail, { borderTopColor: markerColor }]} />

        {/* Distance badge if available */}
        {typeof signal.distance_miles === 'number' && signal.distance_miles < 2 && (
          <View style={[styles.distanceBadge, { backgroundColor: markerColor }]}>
            <Text style={styles.distanceText}>
              {signal.distance_miles.toFixed(1)}mi
            </Text>
          </View>
        )}
      </View>
    </Marker>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    width: 44,
  },
  pulseRing: {
    position: 'absolute',
    top: -4,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    opacity: 0.4,
  },
  bubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  bubbleOpening: {
    borderColor: '#fff',
    borderWidth: 2.5,
  },
  bubblePriority: {
    borderColor: '#fff',
    borderWidth: 2.5,
  },
  emoji: {
    fontSize: 16,
    lineHeight: 20,
  },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  distanceBadge: {
    position: 'absolute',
    bottom: -6,
    right: -2,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  distanceText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
  },
});
