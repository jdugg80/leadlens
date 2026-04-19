import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, LEADS_STORAGE_KEY, EMPTY_LEAD, ROLES } from '../constants';
import { maybeRunAutoExport } from '../utils/autoExport';
import { SectionLabel, StatusBadge, Card } from '../components/UI';
import ManagerDashboardScreen from './ManagerDashboardScreen';

export default function DashboardScreen({ navigation, route }) {
  const { user } = route.params;
  const [leads, setLeads] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const insets = useSafeAreaInsets();

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(LEADS_STORAGE_KEY).then(raw => setLeads(raw ? JSON.parse(raw) : []));
    maybeRunAutoExport(user).catch(() => {});
    setSelectMode(false);
    setSelected(new Set());
  }, [user]));

  if ([ROLES.BRANCH_MANAGER, ROLES.REGIONAL_MANAGER].includes(user?.role)) {
    return <ManagerDashboardScreen navigation={navigation} user={user} leads={leads} />;
  }

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Clear your profile and start over?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('@leadlens_user');
        navigation.replace('Login');
      }},
    ]);
  };

  const toggleSelect = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map((_, i) => i)));
  };

  const deleteSelected = () => {
    if (!selected.size) return;
    Alert.alert(`Delete ${selected.size} lead${selected.size > 1 ? 's' : ''}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const updated = leads.filter((_, i) => !selected.has(i));
        await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(updated));
        setLeads(updated);
        setSelected(new Set());
        setSelectMode(false);
      }},
    ]);
  };

  const goEdit = (lead, idx) => navigation.navigate('Review', { user, lead, editIdx: idx });

  return (
    <View style={s.root}>
      <View style={[s.topBar, { paddingTop: insets.top + 8, height: 56 + insets.top }]}> 
        <Text style={s.topTitle}>LeadLens</Text>
        <View style={s.topRight}>
          <TouchableOpacity style={s.adminBtn} onPress={() => navigation.navigate('Settings', { user })}>
            <Text style={s.adminIcon}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.adminBtn} onPress={() => navigation.navigate('FAQ', { user })}>
            <Text style={s.adminIcon}>❓</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.adminBtn} onPress={() => navigation.navigate('Support', { user })}>
            <Text style={s.adminIcon}>🛟</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.adminBtn} onPress={() => navigation.navigate('Admin', { user })}>
            <Text style={s.adminIcon}>🔒</Text>
          </TouchableOpacity>
          <Text style={s.empBadge}>EMP {user.employeeNum}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        <Card style={s.userCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{user.repName}</Text>
            <Text style={s.userSub}>{user.role} · Branch {user.branchNum}{user.territory ? ` · ${user.territory}` : ''}</Text>
          </View>
          <TouchableOpacity style={s.avatar} onPress={handleSignOut}><Text style={s.avatarText}>{user.repName?.[0] ?? '?'}</Text></TouchableOpacity>
        </Card>

        <SectionLabel>New Prospect</SectionLabel>
        <View style={s.captureRow}>
          <TouchableOpacity style={[s.capBtn, { borderColor: 'rgba(0,201,255,0.4)' }]} onPress={() => navigation.navigate('Capture', { user, lead: { ...EMPTY_LEAD } })} activeOpacity={0.7}>
            <Text style={s.capIcon}>📷</Text>
            <Text style={s.capLabel}>Scan</Text>
            <Text style={s.capSub}>Card · Storefront · Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.capBtn, { borderColor: 'rgba(255,107,43,0.4)' }]} onPress={() => navigation.navigate('ManualEntry', { user, lead: { ...EMPTY_LEAD } })} activeOpacity={0.7}>
            <Text style={s.capIcon}>✏️</Text>
            <Text style={s.capLabel}>Manual</Text>
            <Text style={s.capSub}>Type or speak</Text>
          </TouchableOpacity>
        </View>

        <SectionLabel>Help & Support</SectionLabel>
        <View style={s.captureRow}>
          <TouchableOpacity style={[s.capBtn, { borderColor: 'rgba(0,229,160,0.35)' }]} onPress={() => navigation.navigate('FAQ', { user })} activeOpacity={0.7}>
            <Text style={s.capIcon}>❓</Text>
            <Text style={s.capLabel}>FAQ</Text>
            <Text style={s.capSub}>Quick answers and setup help</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.capBtn, { borderColor: 'rgba(255,59,92,0.35)' }]} onPress={() => navigation.navigate('Support', { user })} activeOpacity={0.7}>
            <Text style={s.capIcon}>🛟</Text>
            <Text style={s.capLabel}>Support</Text>
            <Text style={s.capSub}>Send feedback with attachments</Text>
          </TouchableOpacity>
        </View>

        <View style={s.queueHeader}>
          <SectionLabel>Lead Queue</SectionLabel>
          <View style={s.queueActions}>
            {leads.length > 0 && (
              <>
                <TouchableOpacity onPress={() => { setSelectMode(!selectMode); setSelected(new Set()); }}><Text style={s.queueAction}>{selectMode ? 'CANCEL' : 'SELECT'}</Text></TouchableOpacity>
                {!selectMode && (
                  <TouchableOpacity onPress={() => navigation.navigate('Export', { user, leads })}><Text style={[s.queueAction, { color: COLORS.accent }]}>EXPORT →</Text></TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {selectMode && (
          <View style={s.batchBar}>
            <TouchableOpacity onPress={selectAll}><Text style={s.batchAction}>{selected.size === leads.length ? 'Deselect All' : 'Select All'}</Text></TouchableOpacity>
            <Text style={s.batchCount}>{selected.size} selected</Text>
            <TouchableOpacity onPress={deleteSelected} disabled={!selected.size} style={[s.batchDeleteBtn, !selected.size && { opacity: 0.4 }]}><Text style={s.batchDeleteText}>Delete</Text></TouchableOpacity>
          </View>
        )}

        {leads.length === 0 ? (
          <Text style={s.empty}>No leads yet.{'\n'}Capture your first prospect above.</Text>
        ) : (
          leads.map((lead, idx) => (
            <TouchableOpacity key={lead.id || idx} style={[s.queueCard, selectMode && selected.has(idx) && s.queueCardSelected]} onPress={() => selectMode ? toggleSelect(idx) : goEdit(lead, idx)} activeOpacity={0.7}>
              {selectMode && (
                <View style={[s.checkbox, selected.has(idx) && s.checkboxChecked]}>{selected.has(idx) && <Text style={s.checkmark}>✓</Text>}</View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.queueBiz}>{lead.businessName || 'Unnamed Business'}</Text>
                <Text style={s.queueSub}>{[lead.pocFirst, lead.pocLast].filter(Boolean).join(' ')}{lead.phone ? ` · ${lead.phone}` : ''}</Text>
              </View>
              <StatusBadge status={lead.status} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 10, justifyContent: 'space-between' },
  topTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.4 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  adminIcon: { fontSize: 15 },
  empBadge: { color: COLORS.accent, borderWidth: 1, borderColor: 'rgba(0,201,255,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: '600' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  userCard: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  userName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  userSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#000' },
  captureRow: { flexDirection: 'row', gap: 12 },
  capBtn: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderRadius: 16, paddingVertical: 28, alignItems: 'center', gap: 8 },
  capIcon: { fontSize: 36 },
  capLabel: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  capSub: { fontSize: 11, color: COLORS.muted, textAlign: 'center', paddingHorizontal: 8 },
  queueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  queueActions: { flexDirection: 'row', gap: 16, marginTop: 16 },
  queueAction: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1 },
  batchBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface2, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  batchAction: { fontSize: 13, color: COLORS.accent, fontWeight: '600' },
  batchCount: { fontSize: 13, color: COLORS.muted },
  batchDeleteBtn: { backgroundColor: 'rgba(255,59,92,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  batchDeleteText: { color: COLORS.danger, fontSize: 13, fontWeight: '700' },
  empty: { textAlign: 'center', color: COLORS.muted, fontSize: 13, marginTop: 24, lineHeight: 20 },
  queueCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  queueCardSelected: { borderColor: COLORS.accent, backgroundColor: 'rgba(0,201,255,0.05)' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  checkmark: { color: '#000', fontSize: 13, fontWeight: '800' },
  queueBiz: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  queueSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
});
