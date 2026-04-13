import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, USER_STORAGE_KEY, ROLES } from '../constants';
import { PrimaryButton } from '../components/UI';

const ROLE_OPTIONS = [
  {
    role: ROLES.ACCOUNT_MANAGER,
    icon: '👤',
    desc: 'View and manage your own leads',
    color: COLORS.accent,
  },
  {
    role: ROLES.BRANCH_MANAGER,
    icon: '🏢',
    desc: 'View all leads for your branch',
    color: COLORS.accent2,
  },
  {
    role: ROLES.REGIONAL_MANAGER,
    icon: '🌐',
    desc: 'View all leads across all branches',
    color: COLORS.success,
  },
];

export default function LoginScreen({ navigation }) {
  const [step, setStep] = useState('role'); // 'role' | 'profile'
  const [selectedRole, setSelectedRole] = useState(null);
  const [user, setUser] = useState({
    repName: '', repEmail: '', employeeNum: '', branchNum: '', territory: '', role: '',
  });

  useEffect(() => {
    AsyncStorage.getItem(USER_STORAGE_KEY).then(raw => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.repName && saved.employeeNum && saved.role) {
        navigation.replace('Dashboard', { user: saved });
      }
    });
  }, []);

  const update = (key, val) => setUser(p => ({ ...p, [key]: val }));

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setUser(p => ({ ...p, role }));
    setStep('profile');
  };

  const canLogin = user.repName && user.employeeNum && user.role &&
    (user.role === ROLES.REGIONAL_MANAGER || user.branchNum);

  const handleLogin = async () => {
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    navigation.replace('Dashboard', { user });
  };

  // ── Role selection step ──
  if (step === 'role') {
    return (
      <View style={s.root}>
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.logoWrap}>
            <Image source={require('../../assets/logo.jpg')} style={s.logoImg} resizeMode="contain" />
            <Text style={s.logoTag}>Field Prospecting · AI-Powered</Text>
          </View>

          <Text style={s.stepLabel}>Select Your Role</Text>

          {ROLE_OPTIONS.map(({ role, icon, desc, color }) => (
            <TouchableOpacity
              key={role}
              style={[s.roleCard, { borderColor: color + '55' }]}
              onPress={() => handleRoleSelect(role)}
              activeOpacity={0.75}
            >
              <View style={[s.roleIcon, { backgroundColor: color + '22' }]}>
                <Text style={s.roleIconText}>{icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.roleTitle}>{role}</Text>
                <Text style={s.roleDesc}>{desc}</Text>
              </View>
              <Text style={[s.roleArrow, { color }]}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Profile step ──
  const roleColor = ROLE_OPTIONS.find(r => r.role === selectedRole)?.color || COLORS.accent;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logoWrap}>
          <Image source={require('../../assets/logo.jpg')} style={s.logoImg} resizeMode="contain" />
        </View>

        {/* Role badge */}
        <TouchableOpacity style={[s.roleBadge, { borderColor: roleColor + '55', backgroundColor: roleColor + '11' }]}
          onPress={() => setStep('role')}>
          <Text style={[s.roleBadgeText, { color: roleColor }]}>
            {ROLE_OPTIONS.find(r => r.role === selectedRole)?.icon} {selectedRole}
          </Text>
          <Text style={[s.roleBadgeChange, { color: roleColor }]}>Change ›</Text>
        </TouchableOpacity>

        <View style={s.form}>
          <Field label="Rep Name" placeholder="First Last"
            value={user.repName} onChangeText={v => update('repName', v)} />
          <Field label="Rep Email" placeholder="you@company.com"
            keyboardType="email-address" autoCapitalize="none"
            value={user.repEmail} onChangeText={v => update('repEmail', v)} />

          <View style={s.row}>
            <Field label="Employee #" placeholder="6992986" style={{ flex: 1 }}
              value={user.employeeNum} onChangeText={v => update('employeeNum', v)} />
            {selectedRole !== ROLES.REGIONAL_MANAGER && (
              <>
                <View style={{ width: 10 }} />
                <Field label="Branch #" placeholder="686" style={{ flex: 1 }}
                  value={user.branchNum} onChangeText={v => update('branchNum', v)} />
              </>
            )}
          </View>

          {selectedRole === ROLES.REGIONAL_MANAGER && (
            <Field label="Region / Market" placeholder="e.g. Gulf Coast"
              value={user.territory} onChangeText={v => update('territory', v)} />
          )}

          {selectedRole === ROLES.ACCOUNT_MANAGER && (
            <Field label="Territory (optional)" placeholder="e.g. Houston South"
              value={user.territory} onChangeText={v => update('territory', v)} />
          )}

          <PrimaryButton
            title="Enter LeadLens →"
            onPress={handleLogin}
            disabled={!canLogin}
            style={{ marginTop: 8, backgroundColor: roleColor }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, style, ...props }) {
  return (
    <View style={[s.fieldGroup, style]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={COLORS.muted} {...props} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  logoImg: { width: 220, height: 110 },
  logoTag: { fontSize: 13, color: COLORS.muted, marginTop: 8, letterSpacing: 0.5 },
  stepLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.muted,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14, textAlign: 'center',
  },
  roleCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderRadius: 14,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10,
  },
  roleIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  roleIconText: { fontSize: 24 },
  roleTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  roleDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  roleArrow: { fontSize: 22 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 20,
  },
  roleBadgeText: { fontSize: 14, fontWeight: '700' },
  roleBadgeChange: { fontSize: 12, fontWeight: '600' },
  form: { gap: 12 },
  fieldGroup: {},
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.label,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.text, fontSize: 15,
  },
  row: { flexDirection: 'row' },
});
