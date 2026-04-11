import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, USER_STORAGE_KEY } from '../constants';
import { PrimaryButton } from '../components/UI';

export default function LoginScreen({ navigation }) {
  const [user, setUser] = useState({
    repName: '', repEmail: '', employeeNum: '', branchNum: '', territory: '',
  });

  useEffect(() => {
    AsyncStorage.getItem(USER_STORAGE_KEY).then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.repName && saved.employeeNum && saved.branchNum) {
        navigation.replace('Dashboard', { user: saved });
      }
    });
  }, []);

  const update = (key, val) => setUser((p) => ({ ...p, [key]: val }));
  const canLogin = user.repName && user.employeeNum && user.branchNum;

  const handleLogin = async () => {
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    navigation.replace('Dashboard', { user });
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logoWrap}>
          <Image source={require('../../assets/logo.jpg')} style={s.logoImg} resizeMode="contain" />
          <Text style={s.logoTag}>Field Prospecting · AI-Powered</Text>
        </View>

        <View style={s.form}>
          <Field label="Rep Name" placeholder="First Last"
            value={user.repName} onChangeText={(v) => update('repName', v)} />
          <Field label="Rep Email" placeholder="you@company.com"
            keyboardType="email-address" autoCapitalize="none"
            value={user.repEmail} onChangeText={(v) => update('repEmail', v)} />
          <View style={s.row}>
            <Field label="Employee #" placeholder="6992986" style={{ flex: 1 }}
              value={user.employeeNum} onChangeText={(v) => update('employeeNum', v)} />
            <View style={{ width: 10 }} />
            <Field label="Branch #" placeholder="686" style={{ flex: 1 }}
              value={user.branchNum} onChangeText={(v) => update('branchNum', v)} />
          </View>
          <Field label="Territory / Market (optional)" placeholder="e.g. Houston South"
            value={user.territory} onChangeText={(v) => update('territory', v)} />
          <PrimaryButton
            title="Enter LeadLens →"
            onPress={handleLogin}
            disabled={!canLogin}
            style={{ marginTop: 8 }}
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
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoImg: { width: 220, height: 110 },
  logoTag: { fontSize: 13, color: COLORS.muted, marginTop: 8, letterSpacing: 0.5 },
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
