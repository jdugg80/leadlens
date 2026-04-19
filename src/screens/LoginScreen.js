import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Image, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AUTH_PROFILE_KEY,
  COLORS,
  LEGAL_ACCEPTANCE_KEY,
  PRIVACY_POLICY_VERSION,
  ROLES,
  SUPABASE_SETTINGS_KEY,
  TERMS_VERSION,
  USER_STORAGE_KEY,
  DISABLED_USERS_KEY,
} from '../constants';
import { PrimaryButton } from '../components/UI';
import { sendPasswordReset, signInWithEmailPassword, signInWithOAuthProvider, signUpWithEmailPassword } from '../utils/auth';

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
  const [step, setStep] = useState('role');
  const [selectedRole, setSelectedRole] = useState(null);
  const [authMode, setAuthMode] = useState('local');
  const [user, setUser] = useState({
    repName: '', repEmail: '', employeeNum: '', branchNum: '', territory: '', role: '', authProvider: 'local',
  });
  const [supabaseSettings, setSupabaseSettings] = useState({ supabaseUrl: '', supabaseAnonKey: '' });
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [disabledUsers, setDisabledUsers] = useState({});

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(USER_STORAGE_KEY),
      AsyncStorage.getItem(LEGAL_ACCEPTANCE_KEY),
      AsyncStorage.getItem(SUPABASE_SETTINGS_KEY),
      AsyncStorage.getItem(AUTH_PROFILE_KEY),
      AsyncStorage.getItem(DISABLED_USERS_KEY),
    ]).then(([raw, legal, supa, authProfile, disabledRaw]) => {
      if (supa) {
        try { setSupabaseSettings(JSON.parse(supa)); } catch {}
      }

      if (disabledRaw) {
        try { setDisabledUsers(JSON.parse(disabledRaw) || {}); } catch {}
      }
      if (authProfile) {
        try {
          const parsed = JSON.parse(authProfile);
          setAuthEmail(parsed?.email || '');
          setUser((prev) => ({ ...prev, repEmail: parsed?.email || prev.repEmail, authProvider: parsed?.provider || prev.authProvider }));
        } catch {}
      }
      if (!raw) return;
      const saved = JSON.parse(raw);
      let accepted = false;
      if (legal) {
        try {
          const parsed = JSON.parse(legal);
          accepted = parsed?.privacyVersion === PRIVACY_POLICY_VERSION && parsed?.termsVersion === TERMS_VERSION;
        } catch {}
      }
      if (saved.repName && saved.employeeNum && saved.role) {
        navigation.replace(accepted ? 'Dashboard' : 'Consent', { user: saved });
      }
    });
  }, []);


  const getDisabledEntry = (email) => {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return null;
    return disabledUsers?.[key] || null;
  };

  const assertEnabled = (email) => {
    const disabled = getDisabledEntry(email);
    if (!disabled) return true;
    Alert.alert('Account disabled', disabled.reason ? `This account is currently disabled. Reason: ${disabled.reason}` : 'This account is currently disabled. Contact management if you need access restored.');
    return false;
  };

  const update = (key, val) => setUser((p) => ({ ...p, [key]: val }));
  const ensureSupabase = () => {
    if (supabaseSettings?.supabaseUrl && supabaseSettings?.supabaseAnonKey) return true;
    Alert.alert('Missing Supabase setup', 'Add your Supabase URL and anon key in Settings first, then come back to test secure login.');
    return false;
  };

  const afterSecureAuth = async (profile) => {
    if (!assertEnabled(profile?.email || authEmail || user.repEmail)) return;

    const nextUser = {
      ...user,
      repEmail: profile?.email || user.repEmail || authEmail,
      authProvider: profile?.provider || user.authProvider || 'supabase',
    };
    setUser(nextUser);
    if (profile?.email) {
      await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
    }
    setAuthMode('local');
    setStep('role');
    Alert.alert('Secure sign-in complete', 'Now finish your LeadLens profile so managers and exports know who you are.');
  };

  const runEmailSignIn = async (kind = 'signin') => {
    if (!ensureSupabase()) return;
    if (!assertEnabled(authEmail)) return;
    if (!authEmail.trim() || !authPassword) {
      Alert.alert('Missing credentials', 'Enter your email and password first.');
      return;
    }
    setAuthBusy(true);
    try {
      const result = kind === 'signup'
        ? await signUpWithEmailPassword(supabaseSettings, authEmail, authPassword)
        : await signInWithEmailPassword(supabaseSettings, authEmail, authPassword);
      if (!result.ok) {
        Alert.alert(kind === 'signup' ? 'Sign-up failed' : 'Sign-in failed', result.reason || 'Unknown issue');
        return;
      }
      await afterSecureAuth({ email: result.user?.email || authEmail, provider: 'email' });
    } finally {
      setAuthBusy(false);
    }
  };

  const runProviderSignIn = async (provider) => {
    if (!ensureSupabase()) return;
    if (!assertEnabled(authEmail)) return;
    setAuthBusy(true);
    try {
      const result = await signInWithOAuthProvider(supabaseSettings, provider);
      if (!result.ok) {
        Alert.alert('OAuth sign-in failed', result.reason || 'Unknown issue');
        return;
      }
      await afterSecureAuth({ email: result.user?.email || '', provider });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!ensureSupabase()) return;
    if (!authEmail.trim()) {
      Alert.alert('Need an email', 'Enter the user email first so LeadLens knows where to send the reset link.');
      return;
    }
    const result = await sendPasswordReset(supabaseSettings, authEmail.trim());
    if (!result.ok) Alert.alert('Reset failed', result.reason || 'Unknown issue');
    else Alert.alert('Reset sent', 'A password reset email has been requested. Check the inbox and the spam dungeon too.');
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setUser((p) => ({ ...p, role }));
    setStep('profile');
  };

  const canLogin = user.repName && user.employeeNum && user.role && (user.role === ROLES.REGIONAL_MANAGER || user.branchNum);

  const handleLogin = async () => {
    const payload = { ...user, repEmail: user.repEmail || authEmail };
    if (!assertEnabled(payload.repEmail)) return;
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(payload));
    const rawLegal = await AsyncStorage.getItem(LEGAL_ACCEPTANCE_KEY);
    let accepted = false;
    if (rawLegal) {
      try {
        const parsed = JSON.parse(rawLegal);
        accepted = parsed?.privacyVersion === PRIVACY_POLICY_VERSION && parsed?.termsVersion === TERMS_VERSION;
      } catch {}
    }
    navigation.replace(accepted ? 'Dashboard' : 'Consent', { user: payload });
  };

  if (step === 'role') {
    return (
      <View style={s.root}>
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.logoWrap}>
            <Image source={require('../../assets/logo.jpg')} style={s.logoImg} resizeMode="contain" />
            <Text style={s.logoTag}>Field Prospecting · AI-Powered</Text>
          </View>

          <View style={s.authModeRow}>
            <TouchableOpacity style={[s.authModeChip, authMode === 'local' && s.authModeChipOn]} onPress={() => setAuthMode('local')}>
              <Text style={[s.authModeText, authMode === 'local' && s.authModeTextOn]}>Quick Local Login</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.authModeChip, authMode === 'secure' && s.authModeChipOn]} onPress={() => setAuthMode('secure')}>
              <Text style={[s.authModeText, authMode === 'secure' && s.authModeTextOn]}>Secure Login (Beta)</Text>
            </TouchableOpacity>
          </View>

          {authMode === 'secure' && (
            <View style={s.authPanel}>
              <Text style={s.authTitle}>Secure Sign-In</Text>
              <Text style={s.authSub}>Use Supabase Auth with Google, Microsoft, or email/password. You still finish a LeadLens profile after sign-in.</Text>
              <Field label="Email" placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" value={authEmail} onChangeText={setAuthEmail} />
              <Field label="Password" placeholder="Password" secureTextEntry value={authPassword} onChangeText={setAuthPassword} style={{ marginTop: 10 }} />
              <PrimaryButton title={authBusy ? 'Working...' : 'Sign In with Email'} onPress={() => runEmailSignIn('signin')} disabled={authBusy} style={{ marginTop: 12 }} />
              <TouchableOpacity style={s.inlineAction} onPress={() => runEmailSignIn('signup')}><Text style={s.inlineActionText}>Create account</Text></TouchableOpacity>
              <TouchableOpacity style={s.inlineAction} onPress={handleForgotPassword}><Text style={s.inlineActionText}>Forgot password?</Text></TouchableOpacity>
              <View style={s.providerRow}>
                <TouchableOpacity style={s.providerBtn} onPress={() => runProviderSignIn('google')} disabled={authBusy}><Text style={s.providerText}>Continue with Google</Text></TouchableOpacity>
                <TouchableOpacity style={s.providerBtn} onPress={() => runProviderSignIn('azure')} disabled={authBusy}><Text style={s.providerText}>Continue with Microsoft</Text></TouchableOpacity>
              </View>
            </View>
          )}

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

  const roleColor = ROLE_OPTIONS.find((r) => r.role === selectedRole)?.color || COLORS.accent;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logoWrap}>
          <Image source={require('../../assets/logo.jpg')} style={s.logoImg} resizeMode="contain" />
        </View>

        <TouchableOpacity style={[s.roleBadge, { borderColor: roleColor + '55', backgroundColor: roleColor + '11' }]} onPress={() => setStep('role')}>
          <Text style={[s.roleBadgeText, { color: roleColor }]}>
            {ROLE_OPTIONS.find((r) => r.role === selectedRole)?.icon} {selectedRole}
          </Text>
          <Text style={[s.roleBadgeChange, { color: roleColor }]}>Change ›</Text>
        </TouchableOpacity>

        {!!authEmail && (
          <View style={s.authHint}>
            <Text style={s.authHintText}>Secure auth linked to: {authEmail}</Text>
          </View>
        )}

        <View style={s.form}>
          <Field label="Rep Name" placeholder="First Last" value={user.repName} onChangeText={(v) => update('repName', v)} />
          <Field label="Rep Email" placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" value={user.repEmail || authEmail} onChangeText={(v) => update('repEmail', v)} />

          <View style={s.row}>
            <Field label="Employee #" placeholder="6992986" style={{ flex: 1 }} value={user.employeeNum} onChangeText={(v) => update('employeeNum', v)} />
            {selectedRole !== ROLES.REGIONAL_MANAGER && (
              <>
                <View style={{ width: 10 }} />
                <Field label="Branch #" placeholder="686" style={{ flex: 1 }} value={user.branchNum} onChangeText={(v) => update('branchNum', v)} />
              </>
            )}
          </View>

          {selectedRole === ROLES.REGIONAL_MANAGER && (
            <Field label="Region / Market" placeholder="e.g. Gulf Coast" value={user.territory} onChangeText={(v) => update('territory', v)} />
          )}

          {selectedRole === ROLES.ACCOUNT_MANAGER && (
            <Field label="Territory (optional)" placeholder="e.g. Houston South" value={user.territory} onChangeText={(v) => update('territory', v)} />
          )}

          <PrimaryButton title="Enter LeadLens →" onPress={handleLogin} disabled={!canLogin} style={{ marginTop: 8, backgroundColor: roleColor }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, style, ...props }) {
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        placeholderTextColor={COLORS.muted}
        {...props}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  logoWrap: { alignItems: 'center', marginBottom: 24, marginTop: 12 },
  logoImg: { width: 220, height: 140 },
  logoTag: { color: COLORS.muted, fontSize: 12, marginTop: -4, letterSpacing: 0.4 },
  authModeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  authModeChip: { flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface2, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  authModeChipOn: { borderColor: COLORS.accent, backgroundColor: 'rgba(0,201,255,0.12)' },
  authModeText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  authModeTextOn: { color: COLORS.accent },
  authPanel: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 16, marginBottom: 20 },
  authTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  authSub: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 12 },
  inlineAction: { marginTop: 10, alignItems: 'center' },
  inlineActionText: { color: COLORS.accent2, fontWeight: '700', fontSize: 12 },
  providerRow: { marginTop: 12, gap: 10 },
  providerBtn: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.surface2 },
  providerText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  stepLabel: { color: COLORS.label, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
  roleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  roleIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  roleIconText: { fontSize: 24 },
  roleTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  roleDesc: { color: COLORS.muted, fontSize: 12, marginTop: 4, lineHeight: 18 },
  roleArrow: { fontSize: 26, marginLeft: 12 },
  roleBadge: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderWidth: 1, borderRadius: 16, marginBottom: 18 },
  roleBadgeText: { fontSize: 15, fontWeight: '700' },
  roleBadgeChange: { fontSize: 12, fontWeight: '700' },
  authHint: { padding: 12, borderWidth: 1, borderColor: 'rgba(0,201,255,0.22)', backgroundColor: 'rgba(0,201,255,0.08)', borderRadius: 12, marginBottom: 12 },
  authHintText: { color: COLORS.accent, fontWeight: '700', fontSize: 12 },
  form: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, padding: 18 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  label: { color: COLORS.label, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  input: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, color: COLORS.text, fontSize: 15 },
});
