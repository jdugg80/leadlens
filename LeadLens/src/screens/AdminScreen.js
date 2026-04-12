import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, LEADS_STORAGE_KEY, STATUS_OPTIONS, PROPERTY_TYPES } from '../constants';
import { ScreenHeader } from '../components/UI';
import { exportLeadsToXLSX } from '../utils/exportXlsx';

const ADMIN_PIN_KEY = '@leadlens_admin_pin';
const DEFAULT_PIN = '1234';

export default function AdminScreen({ navigation, route }) {
  const { user } = route.params;
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [leads, setLeads] = useState([]);
  const [tab, setTab] = useState('stats'); // 'stats' | 'leads'
  const [adminPin, setAdminPin] = useState(DEFAULT_PIN);
  const [changingPin, setChangingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(ADMIN_PIN_KEY).then(p => { if (p) setAdminPin(p); });
  }, []);

  useEffect(() => {
    if (unlocked) {
      AsyncStorage.getItem(LEADS_STORAGE_KEY).then(raw => setLeads(raw ? JSON.parse(raw) : []));
    }
  }, [unlocked]);

  const handleUnlock = () => {
    if (pin === adminPin) { setUnlocked(true); setError(''); }
    else { setError('Incorrect PIN'); setPin(''); }
  };

  const handleChangePin = async () => {
    if (newPin.length < 4) { Alert.alert('PIN must be at least 4 digits'); return; }
    if (newPin !== confirmPin) { Alert.alert('PINs do not match'); return; }
    await AsyncStorage.setItem(ADMIN_PIN_KEY, newPin);
    setAdminPin(newPin);
    setChangingPin(false);
    setNewPin(''); setConfirmPin('');
    Alert.alert('PIN updated');
  };

  const handleDeleteLead = (idx) => {
    Alert.alert('Delete Lead', `Remove "${leads[idx].businessName || 'this lead'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const updated = leads.filter((_, i) => i !== idx);
        await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(updated));
        setLeads(updated);
      }},
    ]);
  };

  const handleExport = async () => {
    if (!leads.length) { Alert.alert('No leads to export'); return; }
    try {
      await exportLeadsToXLSX(leads, user);
    } catch (e) {
      Alert.alert('Export failed', e.message);
    }
  };

  // ── Stats ──
  const byStatus = STATUS_OPTIONS.map(s => ({
    label: s,
    count: leads.filter(l => l.status === s).length,
  })).filter(x => x.count > 0);

  const byProperty = PROPERTY_TYPES.map(p => ({
    label: p,
    count: leads.filter(l => l.propertyType === p).length,
  })).filter(x => x.count > 0);

  const byRep = [...new Set(leads.map(l => l.repName || user.repName))].map(rep => ({
    label: rep,
    count: leads.filter(l => (l.repName || user.repName) === rep).length,
  }));

  // ── PIN screen ──
  if (!unlocked) {
    return (
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenHeader title="Admin Access" onBack={() => navigation.goBack()} />
        <View style={s.pinWrap}>
          <Text style={s.pinLockIcon}>🔒</Text>
          <Text style={s.pinTitle}>Admin PIN Required</Text>
          <Text style={s.pinSub}>Default PIN is 1234</Text>
          <TextInput
            style={[s.pinInput, error ? { borderColor: COLORS.danger } : {}]}
            placeholder="Enter PIN"
            placeholderTextColor={COLORS.muted}
            value={pin}
            onChangeText={v => { setPin(v); setError(''); }}
            keyboardType="numeric"
            secureTextEntry
            maxLength={8}
            autoFocus
          />
          {!!error && <Text style={s.pinError}>{error}</Text>}
          <TouchableOpacity style={s.pinBtn} onPress={handleUnlock}>
            <Text style={s.pinBtnText}>Unlock →</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Change PIN ──
  if (changingPin) {
    return (
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenHeader title="Change PIN" onBack={() => setChangingPin(false)} />
        <View style={s.pinWrap}>
          <TextInput
            style={s.pinInput} placeholder="New PIN (min 4 digits)"
            placeholderTextColor={COLORS.muted} value={newPin}
            onChangeText={setNewPin} keyboardType="numeric" secureTextEntry maxLength={8} autoFocus
          />
          <TextInput
            style={[s.pinInput, { marginTop: 12 }]} placeholder="Confirm PIN"
            placeholderTextColor={COLORS.muted} value={confirmPin}
            onChangeText={setConfirmPin} keyboardType="numeric" secureTextEntry maxLength={8}
          />
          <TouchableOpacity style={s.pinBtn} onPress={handleChangePin}>
            <Text style={s.pinBtnText}>Save PIN</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Admin dashboard ──
  return (
    <View style={s.root}>
      <ScreenHeader title="Admin" badge="ADMIN" onBack={() => navigation.goBack()} />

      {/* Tab bar */}
      <View style={s.tabBar}>
        {['stats', 'leads'].map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
              {t === 'stats' ? '📊 Stats' : `📋 Leads (${leads.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

        {tab === 'stats' && (
          <>
            {/* Total */}
            <View style={s.totalCard}>
              <Text style={s.totalNum}>{leads.length}</Text>
              <Text style={s.totalLabel}>Total Leads in Queue</Text>
            </View>

            <StatSection title="By Status" data={byStatus} total={leads.length} color={COLORS.accent} />
            <StatSection title="By Property Type" data={byProperty} total={leads.length} color={COLORS.accent2} />
            <StatSection title="By Sales Rep" data={byRep} total={leads.length} color={COLORS.success} />

            {/* Actions */}
            <Text style={s.sectionLabel}>Actions</Text>
            <TouchableOpacity style={s.actionRow} onPress={handleExport}>
              <Text style={s.actionIcon}>📤</Text>
              <Text style={s.actionLabel}>Export All to Excel</Text>
              <Text style={s.actionArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionRow} onPress={() => setChangingPin(true)}>
              <Text style={s.actionIcon}>🔑</Text>
              <Text style={s.actionLabel}>Change Admin PIN</Text>
              <Text style={s.actionArrow}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionRow, { borderColor: 'rgba(255,59,92,0.3)' }]}
              onPress={() => Alert.alert('Clear All Leads', `Delete all ${leads.length} leads?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear All', style: 'destructive', onPress: async () => {
                  await AsyncStorage.removeItem(LEADS_STORAGE_KEY);
                  setLeads([]);
                }},
              ])}>
              <Text style={s.actionIcon}>🗑️</Text>
              <Text style={[s.actionLabel, { color: COLORS.danger }]}>Clear All Leads</Text>
              <Text style={s.actionArrow}>›</Text>
            </TouchableOpacity>
          </>
        )}

        {tab === 'leads' && (
          <>
            {leads.length === 0 ? (
              <Text style={s.empty}>No leads in queue.</Text>
            ) : (
              leads.map((lead, idx) => (
                <View key={idx} style={s.leadCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.leadBiz}>{lead.businessName || 'Unnamed'}</Text>
                    <Text style={s.leadContact}>
                      {[lead.pocFirst, lead.pocLast].filter(Boolean).join(' ')}
                      {lead.phone ? ` · ${lead.phone}` : ''}
                    </Text>
                    <View style={s.leadMeta}>
                      <Text style={s.leadMetaText}>{lead.status}</Text>
                      <Text style={s.leadMetaDot}>·</Text>
                      <Text style={s.leadMetaText}>{lead.propertyType}</Text>
                      {lead.repName && <>
                        <Text style={s.leadMetaDot}>·</Text>
                        <Text style={s.leadMetaText}>{lead.repName}</Text>
                      </>}
                    </View>
                  </View>
                  <TouchableOpacity style={s.deleteBtn} onPress={() => handleDeleteLead(idx)}>
                    <Text style={s.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatSection({ title, data, total, color }) {
  if (!data.length) return null;
  return (
    <>
      <Text style={s.sectionLabel}>{title}</Text>
      <View style={s.statCard}>
        {data.map(({ label, count }) => (
          <View key={label} style={s.statRow}>
            <Text style={s.statLabel}>{label}</Text>
            <View style={s.statBarWrap}>
              <View style={[s.statBar, { width: `${Math.round((count / total) * 100)}%`, backgroundColor: color }]} />
            </View>
            <Text style={s.statCount}>{count}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },

  // PIN
  pinWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  pinLockIcon: { fontSize: 48 },
  pinTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  pinSub: { fontSize: 13, color: COLORS.muted },
  pinInput: {
    width: '100%', backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.text, fontSize: 20, textAlign: 'center', letterSpacing: 8,
  },
  pinError: { color: COLORS.danger, fontSize: 13 },
  pinBtn: {
    backgroundColor: COLORS.accent, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center',
  },
  pinBtnText: { color: '#000', fontSize: 16, fontWeight: '800', letterSpacing: 1 },

  // Tabs
  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  tabBtnTextActive: { color: COLORS.accent },

  // Stats
  totalCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 24, alignItems: 'center', marginTop: 16,
  },
  totalNum: { fontSize: 52, fontWeight: '800', color: COLORS.accent, lineHeight: 56 },
  totalLabel: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 16,
  },
  statCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 14, gap: 10,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statLabel: { fontSize: 13, color: COLORS.text, width: 110 },
  statBarWrap: { flex: 1, height: 6, backgroundColor: COLORS.surface2, borderRadius: 3, overflow: 'hidden' },
  statBar: { height: '100%', borderRadius: 3 },
  statCount: { fontSize: 13, fontWeight: '700', color: COLORS.text, width: 28, textAlign: 'right' },

  // Actions
  actionRow: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center',
    gap: 12, marginBottom: 8,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  actionArrow: { fontSize: 20, color: COLORS.muted },

  // Leads tab
  leadCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  leadBiz: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  leadContact: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  leadMeta: { flexDirection: 'row', gap: 6, marginTop: 4 },
  leadMetaText: { fontSize: 10, color: COLORS.muted },
  leadMetaDot: { fontSize: 10, color: COLORS.border },
  deleteBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,59,92,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '700' },
  empty: { textAlign: 'center', color: COLORS.muted, fontSize: 13, marginTop: 24 },
});
