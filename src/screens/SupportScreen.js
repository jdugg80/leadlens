/**
 * SupportScreen.js — BETA-47 Redesign
 *
 * Clean hub screen: header + 2 nav buttons + App Metadata.
 * No form here — each button navigates to its own screen.
 *
 * Navigation targets:
 *   - 'BugReportScreen'
 *   - 'FeatureRequestScreen'
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const SUPABASE_URL = 'https://qkbvwryucaakkkqaqvka.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrYnZ3cnl1Y2Fha2trcWFxdmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzODIyNzUsImV4cCI6MjA5MTk1ODI3NX0.Mfi0ca1Ea_tdJlknL-8XKY2MwZpDAnzExco3saLc5RU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true },
});

function getAppMeta() {
  const version =
    Constants.expoConfig?.version || Constants.manifest?.version || '—';
  const build =
    Constants.expoConfig?.extra?.betaBuild ||
    Constants.manifest?.extra?.betaBuild ||
    Constants.expoConfig?.android?.versionCode ||
    '—';
  return { version, build };
}

export default function SupportScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const { version, build } = getAppMeta();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) setUser(data.session.user);
    })();
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Support</Text>
        <Text style={styles.headerSub}>
          Every report and idea goes straight to the team.
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('BugReportScreen', {
  repEmail: user?.email || user?.user_metadata?.email || '',
  repName: user?.user_metadata?.repName || user?.user_metadata?.full_name || '',
})}
          activeOpacity={0.8}
        >
          <Text style={styles.actionBtnIcon}>🐛</Text>
          <View style={styles.actionBtnText}>
            <Text style={styles.actionBtnLabel}>Report a Bug</Text>
            <Text style={styles.actionBtnHint}>Crashes, broken features, unexpected behavior</Text>
          </View>
          <Text style={styles.actionBtnChevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnPurple]}
          onPress={() => navigation.navigate('FeatureRequestScreen', {
  repEmail: user?.email || user?.user_metadata?.email || '',
  repName: user?.user_metadata?.repName || user?.user_metadata?.full_name || '',
})}
          activeOpacity={0.8}
        >
          <Text style={styles.actionBtnIcon}>💡</Text>
          <View style={styles.actionBtnText}>
            <Text style={styles.actionBtnLabel}>Suggest a Feature</Text>
            <Text style={styles.actionBtnHint}>Ideas to make LeadLens work better for you</Text>
          </View>
          <Text style={styles.actionBtnChevron}>›</Text>
        </TouchableOpacity>
      </View>

      {/* App Metadata */}
      <View style={styles.metaCard}>
        <Text style={styles.metaHeader}>App Info</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Version</Text>
          <Text style={styles.metaVal}>{version}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Build</Text>
          <Text style={styles.metaVal}>BETA-{build}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaKey}>Platform</Text>
          <Text style={styles.metaVal}>
            {Platform.OS} {Platform.Version}
          </Text>
        </View>
        {user?.email && (
          <View style={[styles.metaRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.metaKey}>Account</Text>
            <Text style={styles.metaVal}>{user.email}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const C = {
  bg: '#080A0F',
  surface: '#10141C',
  border: '#1C2130',
  cyan: '#00C9FF',
  purple: '#7B3FBE',
  chrome: '#B8BDD0',
  muted: '#555C6E',
  white: '#FFFFFF',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 60 },

  header: { marginBottom: 28 },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.3,
  },
  headerSub: {
    marginTop: 6,
    fontSize: 14,
    color: C.chrome,
    lineHeight: 20,
  },

  actionRow: { gap: 12, marginBottom: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.cyan,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 18,
    gap: 14,
  },
  actionBtnPurple: { borderColor: C.purple },
  actionBtnIcon: { fontSize: 22 },
  actionBtnText: { flex: 1 },
  actionBtnLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: C.white,
    marginBottom: 3,
  },
  actionBtnHint: { fontSize: 12, color: C.muted, lineHeight: 16 },
  actionBtnChevron: { fontSize: 22, color: C.muted, marginLeft: 4 },

  metaCard: {
    marginTop: 32,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 16,
  },
  metaHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  metaKey: { fontSize: 13, color: C.muted },
  metaVal: { fontSize: 13, color: C.chrome, fontWeight: '500' },
});
