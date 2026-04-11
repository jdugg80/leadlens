import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { ScreenHeader, PrimaryButton, SecondaryButton, StatusBadge } from '../components/UI';
import { exportLeadsToXLSX } from '../utils/exportXlsx';

export default function ExportScreen({ navigation, route }) {
  const { user } = route.params;
  const [leads, setLeads] = useState([]);
  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(LEADS_STORAGE_KEY).then((raw) => {
        setLeads(raw ? JSON.parse(raw) : []);
      });
    }, [])
  );

  const handleExport = async () => {
    if (leads.length === 0) return;
    setExporting(true);
    try {
      await exportLeadsToXLSX(leads, user);
    } catch (err) {
      Alert.alert('Export failed', err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleClearQueue = () => {
    Alert.alert('Clear Queue', `Remove all ${leads.length} leads from the queue? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(LEADS_STORAGE_KEY);
          setLeads([]);
          navigation.navigate('Dashboard', { user });
        },
      },
    ]);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Export" badge={`${leads.length} READY`} onBack={() => navigation.goBack()} />

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Summary */}
        <View style={s.summaryCard}>
          <Text style={s.bigCount}>{leads.length}</Text>
          <Text style={s.bigCountLabel}>leads ready to export</Text>
          <Text style={s.empInfo}>EMP {user.employeeNum} · Branch {user.branchNum}</Text>
        </View>

        {/* Column reminder */}
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>Export format</Text>
          <Text style={s.infoBody}>
            Exports as{' '}
            <Text style={{ color: COLORS.accent }}>Sales Module Import Template</Text>
            {' '}— 23 columns (A–W), ready to upload directly. Employee # and Branch # are auto-filled on every row.
          </Text>
        </View>

        {/* Queue preview */}
        <Text style={s.sectionLabel}>Queue Preview</Text>
        {leads.length === 0 ? (
          <Text style={s.empty}>Queue is empty. Go capture some leads.</Text>
        ) : (
          leads.map((lead, i) => (
            <View key={i} style={s.queueRow}>
              <Text style={s.rowNum}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rowBiz}>{lead.businessName || '—'}</Text>
                <Text style={s.rowContact}>
                  {[lead.pocFirst, lead.pocLast].filter(Boolean).join(' ')}
                  {lead.phone ? ` · ${lead.phone}` : ''}
                </Text>
              </View>
              <StatusBadge status={lead.status} />
            </View>
          ))
        )}

        {/* Buttons */}
        <View style={s.buttonArea}>
          {exporting ? (
            <View style={s.exportingRow}>
              <ActivityIndicator color={COLORS.accent} />
              <Text style={s.exportingText}>Building Excel file...</Text>
            </View>
          ) : (
            <PrimaryButton
              title="↓  Export to Excel"
              onPress={handleExport}
              disabled={leads.length === 0}
            />
          )}
          {leads.length > 0 && (
            <SecondaryButton
              title="Clear Queue"
              onPress={handleClearQueue}
              danger
              style={{ marginTop: 10 }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 24,
    alignItems: 'center', marginTop: 16,
  },
  bigCount: { fontSize: 56, fontWeight: '800', color: COLORS.accent, lineHeight: 60 },
  bigCountLabel: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  empInfo: { fontSize: 11, color: COLORS.muted, marginTop: 6, letterSpacing: 0.5 },
  infoCard: {
    backgroundColor: 'rgba(0,201,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(0,201,255,0.15)',
    borderRadius: 12, padding: 14, marginTop: 12,
  },
  infoTitle: { fontSize: 12, fontWeight: '700', color: COLORS.accent, marginBottom: 4 },
  infoBody: { fontSize: 12, color: COLORS.muted, lineHeight: 18 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 16,
  },
  empty: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 16 },
  queueRow: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8,
  },
  rowNum: { width: 20, textAlign: 'right', fontSize: 11, color: COLORS.muted },
  rowBiz: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  rowContact: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  buttonArea: { marginTop: 20 },
  exportingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center', padding: 14 },
  exportingText: { color: COLORS.muted, fontSize: 13 },
});
