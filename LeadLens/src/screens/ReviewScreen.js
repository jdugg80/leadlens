import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { COLORS, LEADS_STORAGE_KEY, STATUS_OPTIONS, PROPERTY_TYPES } from '../constants';
import { ScreenHeader, FieldInput, PrimaryButton, Card, SectionLabel } from '../components/UI';

export default function ReviewScreen({ navigation, route }) {
  const { user, lead: initialLead, editIdx } = route.params;
  const [lead, setLead] = useState({ ...initialLead });

  const update = (key, val) => setLead((p) => ({ ...p, [key]: val }));
  const isEditing = editIdx !== null && editIdx !== undefined;

  const handleSave = async () => {
    const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const leads = raw ? JSON.parse(raw) : [];
    const tagged = { ...lead, repName: user.repName, employeeNum: user.employeeNum, branchNum: user.branchNum };
    if (isEditing) {
      leads[editIdx] = tagged;
      await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
      navigation.navigate('Dashboard', { user });
    } else {
      leads.push(tagged);
      await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
      // Offer intro outreach if contact info exists
      const hasEmail = !!tagged.email;
      const hasPhone = !!tagged.phone;
      if (hasEmail || hasPhone) {
        offerIntroOutreach(tagged);
      } else {
        navigation.navigate('Dashboard', { user });
      }
    }
  };

  const offerIntroOutreach = (savedLead) => {
    const name = [savedLead.pocFirst, savedLead.pocLast].filter(Boolean).join(' ') || savedLead.businessName || 'them';
    const options = [];
    if (savedLead.email) options.push({ text: '✉️ Send Intro Email', onPress: () => sendIntroEmail(savedLead) });
    if (savedLead.phone) options.push({ text: '💬 Send Intro Text', onPress: () => sendIntroText(savedLead) });
    options.push({ text: 'Skip', style: 'cancel', onPress: () => navigation.navigate('Dashboard', { user }) });
    Alert.alert(
      'Lead Saved!',
      `Want to send a quick intro to ${name}?`,
      options
    );
  };

  const sendIntroEmail = (savedLead) => {
    const name = [savedLead.pocFirst, savedLead.pocLast].filter(Boolean).join(' ') || 'there';
    const subject = encodeURIComponent(`Introduction from ${user.repName}`);
    const body = encodeURIComponent(
      `Hi ${name},\n\nMy name is ${user.repName} and I just had the pleasure of visiting ${savedLead.businessName || 'your business'}. I wanted to reach out and introduce myself properly.\n\nI'd love the opportunity to connect and learn more about your business needs. Please don't hesitate to reach out at any time.\n\nBest regards,\n${user.repName}\nBranch ${user.branchNum}`
    );
    Linking.openURL(`mailto:${savedLead.email}?subject=${subject}&body=${body}`).catch(() => {
      Alert.alert('No email app found');
    }).finally(() => navigation.navigate('Dashboard', { user }));
  };

  const sendIntroText = (savedLead) => {
    const name = savedLead.pocFirst || 'there';
    const msg = encodeURIComponent(
      `Hi ${name}, this is ${user.repName}! I just stopped by ${savedLead.businessName || 'your business'} and wanted to connect. Feel free to reach out anytime!`
    );
    const phone = savedLead.phone.replace(/\D/g, '');
    Linking.openURL(`sms:${phone}?body=${msg}`).catch(() => {
      Alert.alert('Could not open messaging app');
    }).finally(() => navigation.navigate('Dashboard', { user }));
  };

  const handleDelete = async () => {
    if (!isEditing) return;
    Alert.alert('Delete Lead', 'Remove this lead from the queue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
          const leads = raw ? JSON.parse(raw) : [];
          leads.splice(editIdx, 1);
          await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
          navigation.navigate('Dashboard', { user });
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader
        title={isEditing ? 'Edit Lead' : 'Review Lead'}
        badge={lead.captureMethod === 'image' ? 'AI EXTRACTED' : 'MANUAL'}
        onBack={() => navigation.goBack()}
      />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {lead.captureMethod === 'image' && (
          <View style={s.extractedBanner}>
            <Text style={s.extractedText}>✔ AI extracted — verify and fill any missing fields</Text>
          </View>
        )}

        <SectionLabel>Business Info</SectionLabel>
        <Card>
          <FieldInput label="Business Name" placeholder="Acme Corp"
            value={lead.businessName} onChangeText={(v) => update('businessName', v)} />
          <View style={[s.row, { marginTop: 10 }]}>
            <FieldInput label="POC First Name" placeholder="Jane"
              value={lead.pocFirst} onChangeText={(v) => update('pocFirst', v)} />
            <View style={{ width: 10 }} />
            <FieldInput label="POC Last Name" placeholder="Smith"
              value={lead.pocLast} onChangeText={(v) => update('pocLast', v)} />
          </View>
        </Card>

        <SectionLabel>Contact</SectionLabel>
        <Card>
          <FieldInput label="Phone" placeholder="(555) 555-5555" keyboardType="phone-pad"
            value={lead.phone} onChangeText={(v) => update('phone', v)} />
          <View style={{ marginTop: 10 }}>
            <FieldInput label="Email" placeholder="contact@biz.com" keyboardType="email-address" autoCapitalize="none"
              value={lead.email} onChangeText={(v) => update('email', v)} />
          </View>
        </Card>

        <SectionLabel>Address</SectionLabel>
        <Card>
          <View style={s.row}>
            <View style={{ width: 80 }}>
              <FieldInput label="St #" placeholder="123"
                value={lead.streetNumber} onChangeText={(v) => update('streetNumber', v)} />
            </View>
            <View style={{ width: 10 }} />
            <FieldInput label="Street Name" placeholder="Main St"
              value={lead.streetName} onChangeText={(v) => update('streetName', v)} />
          </View>
          <View style={{ marginTop: 10 }}>
            <FieldInput label="Address Line 2" placeholder="Suite, Unit, etc."
              value={lead.addressLine2} onChangeText={(v) => update('addressLine2', v)} />
          </View>
          <View style={[s.row, { marginTop: 10 }]}>
            <FieldInput label="City" placeholder="Houston"
              value={lead.city} onChangeText={(v) => update('city', v)} />
            <View style={{ width: 10 }} />
            <View style={{ width: 60 }}>
              <FieldInput label="State" placeholder="TX" maxLength={2} autoCapitalize="characters"
                value={lead.state} onChangeText={(v) => update('state', v.toUpperCase())} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ width: 80 }}>
              <FieldInput label="ZIP" placeholder="77001" keyboardType="numeric"
                value={lead.zip} onChangeText={(v) => update('zip', v)} />
            </View>
          </View>
        </Card>

        <SectionLabel>Classification</SectionLabel>
        <Card>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.pickerLabel}>Status</Text>
              <View style={s.pickerWrap}>
                <Picker selectedValue={lead.status} onValueChange={(v) => update('status', v)}
                  style={s.picker} dropdownIconColor={COLORS.muted}>
                  {STATUS_OPTIONS.map((o) => <Picker.Item key={o} label={o} value={o} color={COLORS.text} />)}
                </Picker>
              </View>
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.pickerLabel}>Property Type</Text>
              <View style={s.pickerWrap}>
                <Picker selectedValue={lead.propertyType} onValueChange={(v) => update('propertyType', v)}
                  style={s.picker} dropdownIconColor={COLORS.muted}>
                  {PROPERTY_TYPES.map((o) => <Picker.Item key={o} label={o} value={o} color={COLORS.text} />)}
                </Picker>
              </View>
            </View>
          </View>
        </Card>

        <SectionLabel>Auto-Filled from Profile</SectionLabel>
        <Card accent>
          <View style={s.autoRow}>
            <AutoField label="Employee #" value={user.employeeNum} />
            <AutoField label="Branch #" value={user.branchNum} />
            <AutoField label="Rep" value={user.repName} />
          </View>
        </Card>

        <PrimaryButton
          title={isEditing ? 'Update Lead ✔' : 'Save to Queue ✔'}
          onPress={handleSave}
          style={{ marginTop: 20 }}
        />
        {isEditing && (
          <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
            <Text style={s.deleteText}>Delete Lead</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AutoField({ label, value }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontFamily: 'Courier', fontSize: 13, color: COLORS.accent }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  extractedBanner: {
    backgroundColor: 'rgba(0,229,160,0.08)', borderWidth: 1,
    borderColor: 'rgba(0,229,160,0.2)', borderRadius: 10, padding: 10, marginTop: 14,
  },
  extractedText: { fontSize: 12, color: COLORS.success },
  row: { flexDirection: 'row' },
  pickerLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.label,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6,
  },
  pickerWrap: {
    backgroundColor: COLORS.surface2, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 10, overflow: 'hidden',
  },
  picker: { color: COLORS.text, height: 44 },
  autoRow: { flexDirection: 'row', gap: 12 },
  deleteBtn: { marginTop: 12, alignItems: 'center', padding: 12 },
  deleteText: { color: COLORS.danger, fontSize: 14, fontWeight: '600' },
});
