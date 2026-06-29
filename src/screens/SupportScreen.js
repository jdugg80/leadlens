/**
 * SupportScreen.js — BETA-51
 * Hub screen: back button, two full-height action buttons, expanded App Info.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true },
});

function getAppMeta() {
  const version = Constants.expoConfig?.version || Constants.manifest?.version || '—';
  const build =
    Constants.expoConfig?.extra?.betaBuild ||
    Constants.manifest?.extra?.betaBuild ||
    Constants.expoConfig?.android?.versionCode ||
    '—';
  return { version, build };
}

function getNow() {
  const now = new Date();
  return now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function SupportScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const { version, build } = getAppMeta();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) setUser(data.session.user);
    })();
  }, []);

  const repEmail = user?.email || user?.user_metadata?.email || '—';
  const repName = user?.user_metadata?.repName || user?.user_metadata?.full_name || '—';
  const deviceName = Device.deviceName || '—';
  const deviceModel = Device.modelName || '—';
  const osVersion = `${Platform.OS} ${Platform.Version}`;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.container}>
        <Text style={styles.headerSub}>
          Every report and idea goes straight to Joe.
        </Text>

        {/* Action Buttons — flex fill */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('BugReportScreen', { repEmail, repName })}
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
            onPress={() => navigation.navigate('FeatureRequestScreen', { repEmail, repName })}
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

        {/* App Info — bottom */}
        <View style={styles.metaCard}>
          <Text style={styles.metaHeader}>App Info</Text>
          <MetaRow label="Version" value={version} />
          <MetaRow label="Build" value={`BETA-${build}`} />
          <MetaRow label="Platform" value={osVersion} />
          <MetaRow label="Device" value={`${deviceModel}${deviceName && deviceName !== deviceModel ? ` (${deviceName})` : ''}`} />
          <MetaRow label="Account" value={repEmail} />
          <MetaRow label="Name" value={repName} />
          <MetaRow label="Date / Time" value={getNow()} last />
        </View>
      </View>
    </View>
  );
}

function MetaRow({ label, value, last }) {
  return (
    <View style={[styles.metaRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.metaKey}>{label}</Text>
      <Text style={styles.metaVal} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const C = {
  bg: '#080A0F', surface: '#10141C', border: '#1C2130',
  cyan: '#00C9FF', purple: '#7B3FBE', chrome: '#B8BDD0',
  muted: '#555C6E', white: '#FFFFFF',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, paddingHorizontal: 20, paddingBottom: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 44, alignItems: 'flex-start' },
  backArrow: { fontSize: 32, color: C.cyan, lineHeight: 36 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white },

  headerSub: { fontSize: 14, color: C.chrome, lineHeight: 20, marginTop: 16, marginBottom: 16 },

  actionRow: { flex: 1, gap: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.cyan,
    borderRadius: 12, paddingHorizontal: 18, gap: 14,
  },
  actionBtnPurple: { borderColor: C.purple },
  actionBtnIcon: { fontSize: 28 },
  actionBtnText: { flex: 1 },
  actionBtnLabel: { fontSize: 17, fontWeight: '600', color: C.white, marginBottom: 4 },
  actionBtnHint: { fontSize: 13, color: C.muted, lineHeight: 18 },
  actionBtnChevron: { fontSize: 26, color: C.muted },

  metaCard: {
    marginTop: 20, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16,
  },
  metaHeader: {
    fontSize: 11, fontWeight: '700', color: C.muted,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  metaKey: { fontSize: 13, color: C.muted },
  metaVal: { fontSize: 13, color: C.chrome, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
});