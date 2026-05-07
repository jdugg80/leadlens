import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  type: 'pest' | 'opening' | 'danger';
}

export const LensSignalBadge = ({ type }: Props) => {
  const icon = type === 'pest' ? '🪳' : type === 'opening' ? '✨' : '⚠️';
  const bgColor = type === 'pest' ? '#78350f' : type === 'opening' ? '#10b981' : '#ef4444';

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={styles.text}>{icon}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute', top: -5, right: -5,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  text: { fontSize: 10, lineHeight: 12 },
});
