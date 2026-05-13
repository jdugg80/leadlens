import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LensSignalRecord } from './lenssignalTypes';
import { getPestIconType, getPestEmoji, getSignalMarkerColor } from './lenssignalScoring';

interface Props {
  signal?: LensSignalRecord;
  type?: 'pest' | 'opening' | 'danger' | 'priority' | 'contact';
  size?: 'sm' | 'md';
}

export const LensSignalBadge = ({ signal, type, size = 'sm' }: Props) => {
  let icon: string;
  let bgColor: string;

  if (signal) {
    // Rich mode — derive from signal data
    if (signal.signal_layer === 'Opening Signal') {
      icon = "\uD83C\uDD95";
      bgColor = '#00C9FF';
    } else if (signal.pest_indicator) {
      const pestType = getPestIconType(signal);
      icon = getPestEmoji(pestType);
      bgColor = getSignalMarkerColor(signal);
    } else {
      icon = signal.alert_level === 'Priority Review' ? "\uD83D\uDD34"
           : signal.alert_level === 'Monitor'         ? "\uD83D\uDFE1"
           : signal.alert_level === 'Opportunity'     ? "\uD83D\uDFE0"
           : "\uD83D\uDCCD";
      bgColor = getSignalMarkerColor(signal);
    }
  } else {
    // Legacy mode — simple type prop
    switch (type) {
      case 'pest':    icon = "\uD83E\uDEB2"; bgColor = '#FF6B2B'; break;
      case 'opening': icon = "\u2728"; bgColor = '#10b981'; break;
      case 'priority': icon = "\uD83D\uDD25"; bgColor = '#CC1040'; break;
      case 'contact': icon = "\uD83D\uDC64"; bgColor = '#00C9FF'; break;
      default:        icon = "\u26A0\uFE0F"; bgColor = '#ef4444';
    }
  }

  const dim = size === 'md' ? 26 : 20;
  const fontSize = size === 'md' ? 13 : 10;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor, width: dim, height: dim, borderRadius: dim / 2 }]}>
      <Text style={[styles.text, { fontSize, lineHeight: fontSize + 2 }]}>{icon}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  text: { textAlign: 'center' },
});
