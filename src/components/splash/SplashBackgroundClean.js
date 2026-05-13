import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Splash background restore.
 *
 * This removes all circuit traces/nodes/glows from the splash background.
 * It preserves layout by rendering children over a simple black background.
 */
export default function SplashBackgroundClean({ children }) {
  return (
    <View style={styles.root}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
  },
});
