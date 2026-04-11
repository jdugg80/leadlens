import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, LEADS_STORAGE_KEY, EMPTY_LEAD } from '../constants';
import { SectionLabel, StatusBadge, Card } from '../components/UI';

export default function DashboardScreen({ navigation, route }) {
  const { user } = route.params;
  const [leads, setLeads] = useState([]);
  const insets = useSafeAreaInsets();

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

  const goCapture = () =>
    navigation.navigate('Capture', { user, lead: { ...EMPTY_LEAD } });

  const goEdit = (lead, idx) =>
    navigation.navigate('Review', { user, lead, editIdx: idx });

  return (
    <View style={s.root}>
      <View style={[s.topBar, { paddingTop: insets.top + 8, height: 56 + insets.top }]}>
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
        <View style={s.captureRow}>
          <TouchableOpacity
            style={[s.bigCapBtn, { borderColor: 'rgba(0,201,255,0.4)' }]}
            onPress={goCapture} activeOpacity={0.7}
          >
            <Text style={s.bigCapIcon}>📷</Text>
            <Text style={s.bigCapLabel}>Scan</Text>
            <Text style={s.bigCapSub}>Camera or gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.bigCapBtn, { borderColor: 'rgba(255,107,43,0.4)' }]}
            onPress={() => navigation.navigate('Capture', { user, lead: { ...EMPTY_LEAD }, startManual: true })}
            activeOpacity={0.7}
          >
            <Text style={s.bigCapIcon}>✏️</Text>
            <Text style={s.bigCapLabel}>Manual</Text>
            <Text style={s.bigCapSub}>Type it in</Text>
          </TouchableOpacity>
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
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 16, paddingBottom: 10,
    justifyContent: 'space-between',
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
  captureRow: { flexDirection: 'row', gap: 12 },
  bigCapBtn: {
    flex: 1, backgroundColor: COLORS.surface,
    borderWidth: 1, borderRadius: 16,
    paddingVertical: 28, alignItems: 'center', gap: 8,
  },
  bigCapIcon: { fontSize: 36 },
  bigCapLabel: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  bigCapSub: { fontSize: 11, color: COLORS.muted },
  queueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  exportLink: { fontSize: 11, color: COLORS.accent, fontWeight: '700', letterSpacing: 1, marginTop: 16 },
  empty: { textAlign: 'center', color: COLORS.muted, fontSize: 13, marginTop: 24, lineHeight: 20 },
  queueCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  queueBiz: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  queueSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
});
