import React, { useState, useCallback } from 'react';
import { SafeAreaView, ScrollView, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator, View } from 'react-native';
import AppScreenBackground from '../components/AppScreenBackground';
import GlassCard from '../components/GlassCard';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { useFocusEffect } from '@react-navigation/native';
import { showThemedAlert } from '../components/ThemedAlert';

export default function ProspectQueueScreen({ navigation, route }) {
  const user = route?.params?.user || {};
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let rawLeads = [];
      try {
        const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) rawLeads = parsed;
        }
      } catch (e) {
        console.warn('[ProspectQueue] Load failed:', e.message);
      }
      if (active) {
        setLeads(rawLeads);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));

  const handleGoogleLookup = async (lead) => {
    const query = [lead.businessName, lead.city, 'pest control phone address']
      .filter(Boolean)
      .join(' ');
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showThemedAlert('Cannot Open Browser', 'Unable to open Google Search on this device.');
      }
    } catch (err) {
      showThemedAlert('Could not open browser', err.message || 'An unexpected error occurred.');
    }
  };

  const goEdit = (lead, idx) => {
    navigation.navigate('Review', { user, lead, editIdx: idx });
  };

  const needsLookup = (lead) => {
    const hasAddress = !!(lead.streetName || lead.streetNumber || lead.city || lead.streetAddress || lead.fullAddress || lead.formattedAddress);
    const hasPhone = !!(lead.phone);
    return !hasAddress || !hasPhone;
  };

  if (loading) {
    return (
      <AppScreenBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        </SafeAreaView>
      </AppScreenBackground>
    );
  }

  return (
    <AppScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Prospect Queue</Text>

          {leads.length === 0 && (
            <Text style={styles.emptyText}>No prospects in queue.</Text>
          )}

          {leads.map((lead, idx) => (
            <GlassCard key={lead.id || `lead_${idx}`} style={styles.card}>
              <TouchableOpacity onPress={() => goEdit(lead, idx)} activeOpacity={0.7}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {lead.businessName || 'Unnamed Business'}
                </Text>

                {lead.phone && (
                  <Text style={styles.cardText}>Phone: {lead.phone}</Text>
                )}
                {lead.email && (
                  <Text style={styles.cardText}>Email: {lead.email}</Text>
                )}

                {needsLookup(lead) && (
                  <TouchableOpacity style={styles.googleBtn} onPress={() => handleGoogleLookup(lead)} activeOpacity={0.7}>
                    <Text style={styles.googleBtnIcon}>🔍</Text>
                    <Text style={styles.googleBtnText}>Google Lookup</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </GlassCard>
          ))}
        </ScrollView>
      </SafeAreaView>
    </AppScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginBottom: 16 },
  emptyText: { color: COLORS.muted, fontSize: 15, textAlign: 'center', marginTop: 40 },
  card: { marginBottom: 14 },
  cardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 6 },
  cardText: { color: 'rgba(255,255,255,0.80)', fontSize: 14, marginBottom: 3 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,201,255,0.1)',
  },
  googleBtnIcon: { fontSize: 13, marginRight: 6 },
  googleBtnText: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
});
