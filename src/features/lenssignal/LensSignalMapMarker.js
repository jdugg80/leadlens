import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { getPestIcon } from '../../utils/pestUtils';

// Visual config per signal_layer
const LAYER_CONFIG = {
  new_opening: {
    icon:        '🆕',
    bg:          '#00E5A0',
    border:      '#00C9FF',
    size:        32,
  },
  compliance: {
    icon:        '⚠️',
    bg:          '#CC1040',
    border:      '#FF3B5C',
    size:        32,
  },
  existing: {
    icon:        '🏢',
    bg:          '#7B3FBE',
    border:      '#9B5FDE',
    size:        28,
  },
};

const DEFAULT_CONFIG = LAYER_CONFIG.existing;

function _LensSignalMapMarker({ signal, onPress, activeProfile }) {
  if (!signal?.latitude || !signal?.longitude) return null;

  const lat = Number(signal.latitude);
  const lng = Number(signal.longitude);
  if (!isFinite(lat) || !isFinite(lng)) return null;

  const layer  = signal.signal_layer || 'existing';
  const cfg    = LAYER_CONFIG[layer] || DEFAULT_CONFIG;
  const hasPest = !!signal.has_pest_indicator;

  // ── PEST-SPECIFIC ICONS FOR COMPLIANCE SIGNALS (#PEST-01)
  let icon = cfg.icon;
  if (layer === 'compliance' && signal.pest_details) {
    icon = getPestIcon(signal.pest_details);
  }

  // Pest indicator overrides border color to red
  const borderColor = hasPest ? '#FF3B5C' : cfg.border;

  const size = cfg.size;

  return (
    <Marker
      coordinate={{ latitude: lat, longitude: lng }}
      onPress={() => onPress && onPress(signal)}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
    >
      <View style={[
        s.pin,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: cfg.bg,
          borderColor,
        }
      ]}>
        <Text style={{ fontSize: size * 0.45 }}>{icon}</Text>
        {hasPest && (
          <View style={s.pestDot} />
        )}
      </View>
    </Marker>
  );
}

export const LensSignalMapMarker = memo(_LensSignalMapMarker);

const s = StyleSheet.create({
  pin: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  pestDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B5C',
    borderWidth: 1,
    borderColor: '#fff',
  },
});
