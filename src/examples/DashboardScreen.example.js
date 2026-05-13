import React from 'react';
import { SafeAreaView, Text, View, StyleSheet } from 'react-native';
import AppScreenBackground from '../components/AppScreenBackground';
import GlassCard from '../components/GlassCard';

export default function DashboardScreen() {
  return (
    <AppScreenBackground variant="scifi">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>LeadLens Dashboard</Text>
          <Text style={styles.subtitle}>Console overview and quick actions</Text>

          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Today&apos;s Snapshot</Text>
            <Text style={styles.cardText}>Prospects queued: 24</Text>
            <Text style={styles.cardText}>Mapped zips: 17</Text>
            <Text style={styles.cardText}>Exports completed: 6</Text>
          </GlassCard>
        </View>
      </SafeAreaView>
    </AppScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1, padding: 20 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 8 },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 14, marginTop: 6, marginBottom: 18 },
  card: { marginTop: 12 },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  cardText: { color: 'rgba(255,255,255,0.82)', fontSize: 14, marginBottom: 4 },
});
