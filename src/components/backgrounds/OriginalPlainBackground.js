import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Original-style LeadLens background restore.
 *
 * Purpose:
 * - Removes circuit/chrome traces
 * - Removes decorative line/node clutter
 * - Keeps a clean dark app background
 * - Preserves children/layout
 */
export default function OriginalPlainBackground({ children, style }) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.base} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
  },
});
