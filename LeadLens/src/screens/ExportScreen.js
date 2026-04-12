import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system';
import { utils, write } from 'xlsx';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { ScreenHeader, StatusBadge } from '../components/UI';
import { exportLeadsToXLSX } from '../utils/exportXlsx';

// Build xlsx file and return its URI
async function buildXlsxFile(leads, user) {
  const HEADERS = [
    'Employee #','Branch','Route','Status','PropertyDescription',
    'PropertyType','BusinessName','FirstName','LastName','Salutation',
    'Phone','Type','Email','StreetNum','StreetName','AddressLine2',
    'City','State','Zip','Instructions/Comments',
    'Prospect Source Category','Prospect Source','CampaignId',
  ];
  const rows = leads.map(l => [
    user.employeeNum, user.branchNum, '', l.status, '',
    l.propertyType, l.businessName, l.pocFirst, l.pocLast, '',
    l.phone, '', l.email, l.streetNumber, l.streetName, l.addressLine2,
    l.city, l.state, l.zip, '', '', '', '',
  ]);
  const ws = utils.aoa_to_sheet([HEADERS, ...rows]);
  ws['!cols'] = HEADERS.map(h => ({ wch: Math.max(h.length + 2, 12) }));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Sales Module Import Template');
  const b64 = write(wb, { type: 'base64', bookType: 'xlsx' });
  const date = new Date().toISOString().slice(0, 10);
  const fileUri = FileSystem.cacheDirectory + `LeadLens_Export_${date}.xlsx`;
  await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });
  return fileUri;
}

export default function ExportScreen({ navigation, route }) {
  const { user } = route.params;
  const [leads, setLeads] = useState([]);
  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(LEADS_STORAGE_KEY).then(raw => setLeads(raw ? JSON.parse(raw) : []));
    }, [])
  );

  const handleShare = async () => {
    if (!leads.length) return;
    setExporting(true);
    try {
      await exportLeadsToXLSX(leads, user);
    } catch (err) {
      Alert.alert('Export failed', err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleEmail = async () => {
    if (!leads.length) return;
    setExporting(true);
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('No email app found', 'Please set up an email account on your phone first, or use the Share option instead.');
        setExporting(false);
        return;
      }
      const fileUri = await buildXlsxFile(leads, user);
      const date = new Date().toISOString().slice(0, 10);
      await MailComposer.composeAsync({
        subject: `LeadLens Export — ${date} (${leads.length} leads)`,
        body: `Hi,\n\nPlease find attached the LeadLens lead export for ${date}.\n\nRep: ${user.repName}\nBranch: ${user.branchNum}\nEmployee #: ${user.employeeNum}\nLeads: ${leads.length}\n\nReady to import into Sales Module.`,
        attachments: [fileUri],
      });
    } catch (err) {
      Alert.alert('Email failed', err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleClearQueue = () => {
    Alert.alert('Clear Queue', `Remove all ${leads.length} leads from the queue?`, [
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

        {/* Export buttons */}
        {exporting ? (
          <View style={s.exportingRow}>
            <ActivityIndicator color={COLORS.accent} />
            <Text style={s.exportingText}>Building Excel file...</Text>
          </View>
        ) : (
          <View style={s.exportBtns}>
            {/* Email */}
            <TouchableOpacity
              style={[s.exportBtn, { borderColor: 'rgba(0,201,255,0.4)', opacity: leads.length ? 1 : 0.4 }]}
              onPress={handleEmail} disabled={!leads.length} activeOpacity={0.8}
            >
              <Text style={s.exportBtnIcon}>✉️</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.exportBtnLabel}>Send via Email</Text>
                <Text style={s.exportBtnSub}>Opens mail app with .xlsx attached</Text>
              </View>
              <Text style={s.exportArrow}>›</Text>
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity
              style={[s.exportBtn, { borderColor: 'rgba(0,229,160,0.4)', opacity: leads.length ? 1 : 0.4 }]}
              onPress={handleShare} disabled={!leads.length} activeOpacity={0.8}
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
    borderRadius: 14, padding: 24, alignItems: 'center', marginTop: 16, marginBottom: 16,
  },
  bigCount: { fontSize: 56, fontWeight: '800', color: COLORS.accent, lineHeight: 60 },
  bigCountLabel: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  empInfo: { fontSize: 11, color: COLORS.muted, marginTop: 6 },
  exportBtns: { gap: 10, marginBottom: 8 },
  exportBtn: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderRadius: 14,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  exportBtnIcon: { fontSize: 28 },
  exportBtnLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  exportBtnSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  exportArrow: { fontSize: 22, color: COLORS.muted },
  exportingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center', padding: 20 },
  exportingText: { color: COLORS.muted, fontSize: 13 },
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
