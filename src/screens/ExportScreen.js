import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, SafeAreaView, Vibration,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as MailComposer from 'expo-mail-composer';
import { shareFileWithEmail } from '../utils/emailPicker';
import * as FileSystem from 'expo-file-system';
import { utils, write } from 'xlsx';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { ScreenHeader, StatusBadge } from '../components/UI';
import { exportLeadsToXLSX } from '../utils/exportXlsx';

const HEADERS = [
  'Employee #','Branch','Route','Status','PropertyDescription',
  'PropertyType','BusinessName','FirstName','LastName','Salutation',
  'Phone','Type','Email','StreetNum','StreetName','AddressLine2',
  'City','State','Zip','Instructions/Comments',
  'Prospect Source Category','Prospect Source','CampaignId',
];

function buildRows(leads, user) {
  return leads.map(l => [
    user.employeeNum, user.branchNum, '', l.status, '',
    l.propertyType, l.businessName, l.pocFirst, l.pocLast, '',
    l.phone, '', l.email, l.streetNumber, l.streetName, l.addressLine2,
    l.city, l.state, l.zip, '', '', '', '',
  ]);
}

async function buildXlsxUri(leads, user) {
  const ws = utils.aoa_to_sheet([HEADERS, ...buildRows(leads, user)]);
  ws['!cols'] = HEADERS.map(h => ({ wch: Math.max(h.length + 2, 12) }));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Sales Module Import Template');
  const b64 = write(wb, { type: 'base64', bookType: 'xlsx' });
  const date = new Date().toISOString().slice(0, 10);
  const uri = FileSystem.cacheDirectory + `LeadLens_Export_${date}.xlsx`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

export default function ExportScreen({ navigation, route }) {
  const { user } = route.params;
  const [leads, setLeads] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null); // null | 'success' | 'failed'

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(LEADS_STORAGE_KEY).then(raw => setLeads(raw ? JSON.parse(raw) : []));
    setExportStatus(null);
  }, []));

  const doExport = async (method) => {
    if (!leads.length) return;
    setExporting(true);
    setExportStatus(null);
    try {
      if (method === 'share') {
        await exportLeadsToXLSX(leads, user);
      } else {
        // Email: build the file then share it — Android share sheet lets
        // the user pick Gmail, Outlook, Yahoo, or any other app themselves
        const fileUri = await buildXlsxUri(leads, user);
        const date = new Date().toISOString().slice(0, 10);
        await shareFileWithEmail(fileUri, {
          subject: `LeadLens Export — ${date} (${leads.length} leads)`,
          body: `Rep: ${user.repName}\nBranch: ${user.branchNum}\nEmployee #: ${user.employeeNum}\nLeads: ${leads.length}`,
        });
      }
      setExportStatus('success');
      Vibration.vibrate([0, 80, 60, 80, 60, 200]);
      // Offer to clear queue after successful export
      Alert.alert(
        'Export Successful! ✅',
        'Do you want to clear the queue now?',
        [
          { text: 'Keep Queue', style: 'cancel' },
          {
            text: 'Clear Queue', onPress: async () => {
              await AsyncStorage.removeItem(LEADS_STORAGE_KEY);
              setLeads([]);
            },
          },
        ]
      );
    } catch (err) {
      setExportStatus('failed');
      // Fail vibration: long buzz
      Vibration.vibrate(600);
      Alert.alert('Export failed', err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleClearQueue = () => {
    Alert.alert('Clear Queue', `Remove all ${leads.length} leads?`, [
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
    <SafeAreaView style={s.root}>
      <ScreenHeader title="Export" badge={`${leads.length} READY`} onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Summary */}
        <View style={s.summaryCard}>
          <Text style={s.bigCount}>{leads.length}</Text>
          <Text style={s.bigCountLabel}>leads ready to export</Text>
          <Text style={s.empInfo}>EMP {user.employeeNum} · Branch {user.branchNum}</Text>
        </View>

        {/* Status feedback */}
        {exportStatus === 'success' && (
          <View style={[s.statusBanner, { borderColor: COLORS.success, backgroundColor: 'rgba(0,229,160,0.08)' }]}>
            <Text style={[s.statusIcon]}>✅</Text>
            <Text style={[s.statusText, { color: COLORS.success }]}>Export successful!</Text>
          </View>
        )}
        {exportStatus === 'failed' && (
          <View style={[s.statusBanner, { borderColor: COLORS.danger, backgroundColor: 'rgba(255,59,92,0.08)' }]}>
            <Text style={s.statusIcon}>❌</Text>
            <Text style={[s.statusText, { color: COLORS.danger }]}>Export failed — try again</Text>
          </View>
        )}

        {/* Export buttons */}
        {exporting ? (
          <View style={s.exportingWrap}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={s.exportingText}>Building your Excel file...</Text>
            <Text style={s.exportingSub}>{leads.length} leads · {HEADERS.length} columns</Text>
          </View>
        ) : (
          <View style={s.exportBtns}>
            <TouchableOpacity
              style={[s.exportBtn, { borderColor: 'rgba(0,201,255,0.4)', opacity: leads.length ? 1 : 0.4 }]}
              onPress={() => doExport('email')} disabled={!leads.length} activeOpacity={0.8}
            >
              <Text style={s.exportBtnIcon}>✉️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.exportBtnLabel}>Email File</Text>
                <Text style={s.exportBtnSub}>Pick Gmail, Outlook, Yahoo, or any app</Text>
              </View>
              <Text style={s.exportArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.exportBtn, { borderColor: 'rgba(0,229,160,0.4)', opacity: leads.length ? 1 : 0.4 }]}
              onPress={() => doExport('share')} disabled={!leads.length} activeOpacity={0.8}
            >
              <Text style={s.exportBtnIcon}>📤</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.exportBtnLabel}>Share / Save File</Text>
                <Text style={s.exportBtnSub}>Drive, Files, Messages, etc.</Text>
              </View>
              <Text style={s.exportArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Queue preview */}
        <Text style={s.sectionLabel}>Queue Preview</Text>
        {leads.length === 0 ? (
          <Text style={s.empty}>Queue is empty. Capture some leads first.</Text>
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

        {leads.length > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={handleClearQueue}>
            <Text style={s.clearText}>Clear Queue</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  summaryCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 24, alignItems: 'center', marginTop: 16, marginBottom: 12,
  },
  bigCount: { fontSize: 56, fontWeight: '800', color: COLORS.accent, lineHeight: 60 },
  bigCountLabel: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  empInfo: { fontSize: 11, color: COLORS.muted, marginTop: 6 },
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12,
  },
  statusIcon: { fontSize: 20 },
  statusText: { fontSize: 14, fontWeight: '700' },
  exportingWrap: {
    alignItems: 'center', padding: 28, gap: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, marginBottom: 12,
  },
  exportingText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  exportingSub: { color: COLORS.muted, fontSize: 12 },
  exportBtns: { gap: 10, marginBottom: 4 },
  exportBtn: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderRadius: 14,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  exportBtnIcon: { fontSize: 28 },
  exportBtnLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  exportBtnSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  exportArrow: { fontSize: 22, color: COLORS.muted },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 16,
  },
  empty: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 16 },
  queueRow: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8,
  },
  rowNum: { width: 20, textAlign: 'right', fontSize: 11, color: COLORS.muted },
  rowBiz: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  rowContact: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  clearBtn: { marginTop: 16, alignItems: 'center', padding: 12 },
  clearText: { color: COLORS.danger, fontSize: 14, fontWeight: '600' },
});
