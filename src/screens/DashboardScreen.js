import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, LEADS_STORAGE_KEY, EMPTY_LEAD } from '../constants';
import { SectionLabel, StatusBadge, Card } from '../components/UI';

export default function DashboardScreen({ navigation, route }) {
  const { user } = route.params;
  const [leads, setLeads] = useState([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(LEADS_STORAGE_KEY).then((raw) => {
        setLeads(raw ? JSON.parse(raw) : []);
      });
    }, [])
  );

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Clear your profile and start over?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('@leadlens_user');
          navigation.replace('Login');
        },
      },
    ]);
  };

  const goCapture = (mode) =>
    navigation.navigate('Capture', { user, mode, lead: { ...EMPTY_LEAD } });

  const goEdit = (lead, idx) =>
    navigation.navigate('Review', { user, lead, editIdx: idx });

  const QUICK_ACTIONS = [
    { label: 'Scan Business Card', sub: 'Camera or gallery', icon: '📷', mode: 'image', color: COLORS.accent },
    { label: 'Import Screenshot', sub: 'From photo library', icon: '🖼️', mode: 'image', color: COLORS.accent2 },
    { label: 'Scan Storefront', sub: 'Capture signage', icon: '🔍', mode: 'image', color: COLORS.success },
    { label: 'Manual Entry', sub: 'Type it in', icon: '✏️', mode: 'manual', color: COLORS.danger },
  ];

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Text style={s.topTitle}>LeadLens</Text>
        <Text style={s.empBadge}>EMP {user.employeeNum}</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* User card */}
        <Card style={s.userCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{user.repName}</Text>
            <Text style={s.userSub}>
              Branch {user.branchNum}{user.territory ? ` · ${user.territory}` : ''}
            </Text>
          </View>
          <TouchableOpacity style={s.avatar} onPress={handleSignOut}>
            <Text style={s.avatarText}>{user.repName?.[0] ?? '?'}</Text>
          </TouchableOpacity>
        </Card>

        {/* Quick capture */}
        <SectionLabel>Quick Capture</SectionLabel>
        <View style={s.actionGrid}>
          {QUICK_ACTIONS.map(({ label, sub, icon, mode, color }) => (
            <TouchableOpacity
              key={label}
              style={[s.actionCard, { borderColor: color + '33' }]}
              onPress={() => goCapture(mode)}
              activeOpacity={0.7}
            >
              <View style={[s.actionIcon, { backgroundColor: color + '22' }]}>
                <Text style={s.actionIconText}>{icon}</Text>
              </View>
              <Text style={s.actionLabel}>{label}</Text>
              <Text style={s.actionSub}>{sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Queue */}
        <View style={s.queueHeader}>
          <SectionLabel>Lead Queue</SectionLabel>
          {leads.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('Export', { user, leads })}>
              <Text style={s.exportLink}>EXPORT →</Text>
            </TouchableOpacity>
          )}
        </View>

        {leads.length === 0 ? (
          <Text style={s.empty}>No leads yet.{'\n'}Capture your first prospect above.</Text>
        ) : (
          leads.map((lead, idx) => (
            <TouchableOpacity key={idx} style={s.queueCard} onPress={() => goEdit(lead, idx)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={s.queueBiz}>{lead.businessName || 'Unnamed Business'}</Text>
                <Text style={s.queueSub}>
                  {[lead.pocFirst, lead.pocLast].filter(Boolean).join(' ')}
                  {lead.phone ? ` · ${lead.phone}` : ''}
                </Text>
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
  topBar: {
    height: 56, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, justifyContent: 'space-between',
  },
  topTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: 0.5 },
  empBadge: {
    backgroundColor: 'rgba(0,201,255,0.12)', color: COLORS.accent,
    borderWidth: 1, borderColor: 'rgba(0,201,255,0.25)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    fontSize: 11, fontWeight: '600',
  },
  scroll: { flex: 1, paddingHorizontal: 16 },
  userCard: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  userName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  userSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  avatar: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#000' },
  actionGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  actionCard: {
    width: '47.5%',
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderRadius: 14,
    padding: 14, gap: 8,
  },
  actionIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionIconText: { fontSize: 20 },
  actionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  actionSub: { fontSize: 11, color: COLORS.muted },
  queueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  exportLink: { fontSize: 11, color: COLORS.accent, fontWeight: '700', letterSpacing: 1 },
  empty: { textAlign: 'center', color: COLORS.muted, fontSize: 13, marginTop: 24, lineHeight: 20 },
  queueCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 8,
  },
  queueBiz: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  queueSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
});
