import React from 'react';
import { SafeAreaView, Text, View, StyleSheet } from 'react-native';
import AppScreenBackground from '../components/AppScreenBackground';

export default function TerritoryMapScreen() {
  return (
    <AppScreenBackground variant="premium">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Territory Map</Text>
          <Text style={styles.subtitle}>Keep your existing MapView logic. Only replace the pulsing overlay with static activity polygons.</Text>
        </View>

        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>Place your existing MapView here</Text>
        </View>
      </SafeAreaView>
    </AppScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 13, marginTop: 6 },
  mapPlaceholder: {
    flex: 1,
    margin: 20,
    borderRadius: 18,
    backgroundColor: 'rgba(10,14,18,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(220,228,236,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapText: { color: 'rgba(255,255,255,0.72)' },
});
