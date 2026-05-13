import React from 'react';
import { SafeAreaView, ScrollView, Text, StyleSheet } from 'react-native';
import AppScreenBackground from '../components/AppScreenBackground';
import GlassCard from '../components/GlassCard';

export default function SettingsScreen() {
  return (
    <AppScreenBackground variant="premium">
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Settings</Text>

          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Profile</Text>
            <Text style={styles.cardText}>Name, email, phone, account settings</Text>
          </GlassCard>

          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Preferences</Text>
            <Text style={styles.cardText}>Theme, export behavior, map controls</Text>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </AppScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginBottom: 16 },
  card: { marginBottom: 14 },
  cardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  cardText: { color: 'rgba(255,255,255,0.80)', fontSize: 14 },
});
