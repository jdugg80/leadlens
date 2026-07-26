import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function PlaceholderScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Triage Required</Text>
      <Text style={styles.body}>
        This screen is a placeholder created in response to an incomplete bug report.
        Please provide reproduction steps, affected files, and expected vs. actual
        behavior before a targeted fix can be applied.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    color: '#AAAAAA',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
