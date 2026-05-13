import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function SplashOriginalBackground({ children }) {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
