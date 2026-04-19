import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APP_VERSION,
  COLORS,
  LEGAL_ACCEPTANCE_KEY,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
} from '../constants';
import { Card, PrimaryButton, ScreenHeader, SectionLabel } from '../components/UI';

export default function ConsentScreen({ navigation, route }) {
  const { user } = route.params || {};
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [lawChecked, setLawChecked] = useState(false);
  const ready = privacyChecked && termsChecked && lawChecked;

  const accept = async () => {
    if (!ready) {
      Alert.alert('Almost there', 'Please check each acknowledgment before continuing.');
      return;
    }
    const payload = {
      acceptedAt: new Date().toISOString(),
      privacyVersion: PRIVACY_POLICY_VERSION,
      termsVersion: TERMS_VERSION,
      appVersion: APP_VERSION,
      repName: user?.repName || '',
      employeeNum: user?.employeeNum || '',
    };
    await AsyncStorage.setItem(LEGAL_ACCEPTANCE_KEY, JSON.stringify(payload));
    if (user) navigation.replace('Dashboard', { user });
    else navigation.replace('Login');
  };

  const CheckRow = ({ checked, onPress, text }) => (
    <TouchableOpacity style={s.checkRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.checkbox, checked && s.checkboxOn]}>{checked ? <Text style={s.checkMark}>✓</Text> : null}</View>
      <Text style={s.checkText}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <ScreenHeader title="Before You Continue" badge={`v${APP_VERSION}`} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        <Card accent>
          <Text style={s.lead}>LeadLens uses captured images, extracted lead data, local storage, optional automation features, and certain device permissions to support lead capture and export workflows.</Text>
          <Text style={s.sub}>Review and acknowledge the documents below before entering the app.</Text>
        </Card>

        <SectionLabel>Required Acknowledgments</SectionLabel>
        <Card>
          <CheckRow checked={privacyChecked} onPress={() => setPrivacyChecked((v) => !v)} text="I have read and acknowledge the Privacy Policy." />
          <CheckRow checked={termsChecked} onPress={() => setTermsChecked((v) => !v)} text="I have read and agree to the Terms of Use." />
          <CheckRow checked={lawChecked} onPress={() => setLawChecked((v) => !v)} text="I understand that I am responsible for complying with applicable privacy, consent, anti-spam, and communication laws when using LeadLens." />
        </Card>

        <SectionLabel>Review Documents</SectionLabel>
        <Card>
          <TouchableOpacity style={s.linkBtn} onPress={() => navigation.navigate('LegalDocument', { title: 'Privacy Policy', type: 'privacy' })}>
            <Text style={s.linkTitle}>Privacy Policy</Text>
            <Text style={s.linkSub}>Version {PRIVACY_POLICY_VERSION}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.linkBtn} onPress={() => navigation.navigate('LegalDocument', { title: 'Terms of Use', type: 'terms' })}>
            <Text style={s.linkTitle}>Terms of Use</Text>
            <Text style={s.linkSub}>Version {TERMS_VERSION}</Text>
          </TouchableOpacity>
        </Card>

        <PrimaryButton title="Accept and Continue" onPress={accept} disabled={!ready} style={{ marginTop: 20 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  lead: { color: COLORS.text, fontSize: 14, lineHeight: 22, fontWeight: '700' },
  sub: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  checkMark: { color: '#000', fontWeight: '900' },
  checkText: { flex: 1, color: COLORS.text, fontSize: 13, lineHeight: 20 },
  linkBtn: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.surface2, padding: 14, marginBottom: 10 },
  linkTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  linkSub: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
});
