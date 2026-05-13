import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function GlassCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(12, 16, 22, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(220, 228, 236, 0.12)',
    borderRadius: 16,
    padding: 16,
  },
});
