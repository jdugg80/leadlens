import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { sendIntroEmail as composeIntroEmail } from '../utils/emailPicker';
import { COLORS, LEADS_STORAGE_KEY, STATUS_OPTIONS, INDUSTRY_VERTICALS, AUTO_INTRO_KEY } from '../constants';
import { ScreenHeader, FieldInput, PrimaryButton, Card, SectionLabel } from '../components/UI';
import { applyRequiredPlaceholders, findDuplicateInLeads, inferVertical, normalizeLead } from '../utils/leadHelpers';
import { applyTemplate, buildTemplateContext, getIntroTemplates } from '../utils/templateSettings';

export default function ReviewScreen({ navigation, route }) {
  const { user, lead: initialLead, editIdx } = route.params;
  const [lead, setLead] = useState(normalizeLead(initialLead || {}));
  const [autoIntro, setAutoIntro] = useState(true);
  const [templates, setTemplates] = useState(null);
  const isEditing = editIdx !== null && editIdx !== undefined;

  useEffect(() => {
    AsyncStorage.getItem(AUTO_INTRO_KEY).then((v) => {
      if (v !== null) setAutoIntro(v === 'true');
    });
    getIntroTemplates().then(setTemplates);
  }, []);

  const update = (key, val) => setLead((p) => ({ ...p, [key]: key === 'propertyType' ? 'Commercial' : val }));

  const offerIntroOutreach = (savedLead) => {
    const name = [savedLead.pocFirst, savedLead.pocLast].filter(Boolean).join(' ') || savedLead.businessName || 'them';
    const options = [];
    if (savedLead.email) options.push({ text: '✉️ Send Intro Email', onPress: () => sendIntro(savedLead) });
    if (savedLead.phone) options.push({ text: '💬 Send Intro Text', onPress: () => sendIntroText(savedLead) });
    options.push({ text: 'Done', style: 'cancel', onPress: () => navigation.navigate('Dashboard', { user }) });
    Alert.alert('Lead Saved', `Want to send a quick intro to ${name}?`, options);
  };

  const sendIntro = async (savedLead) => {
    const currentTemplates = templates || (await getIntroTemplates());
    const context = buildTemplateContext(savedLead, user);
    await composeIntroEmail({
      to: savedLead.email,
      subject: applyTemplate(currentTemplates.emailSubject, context),
      body: applyTemplate(currentTemplates.emailBody, context),
    });
    navigation.navigate('Dashboard', { user });
  };

  const sendIntroText = async (savedLead) => {
    try {
      const currentTemplates = templates || (await getIntroTemplates());
      const context = buildTemplateContext(savedLead, user);
      const msg = encodeURIComponent(applyTemplate(currentTemplates.smsBody, context));
      const phone = String(savedLead.phone || '').replace(/\D/g, '');
      await Linking.openURL(`sms:${phone}?body=${msg}`);
    } catch {
      Alert.alert('Could not open messaging app');
    } finally {
      navigation.navigate('Dashboard', { user });
    }
  };

  const persistLead = async (ignoreDuplicate = false) => {
    const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const leads = raw ? JSON.parse(raw) : [];
    const normalized = applyRequiredPlaceholders({
      ...normalizeLead({ ...lead, propertyType: 'Commercial' }),
      ...inferVertical(lead),
      reviewed: true,
      id: lead.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      repName: user.repName,
      employeeNum: user.employeeNum,
      branchNum: user.branchNum,
    });

    if (!isEditing) {
      const duplicate = findDuplicateInLeads(normalized, leads);
      if (duplicate && !ignoreDuplicate) {
        Alert.alert(
          duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate',
          `${normalized.businessName || 'This lead'} appears to already be in your queue because of ${duplicate.reason}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Keep Anyway', onPress: () => persistLead(true) },
          ],
        );
        return;
      }
      leads.push({ ...normalized, duplicateWarning: duplicate ? `${duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate'}: ${duplicate.reason}` : '' });
    } else {
      leads[editIdx] = normalized;
    }

    await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
    const hasContact = !!(normalized.email || normalized.phone);
    if (!isEditing && hasContact && autoIntro) {
      offerIntroOutreach(normalized);
    } else {
      navigation.navigate('Dashboard', { user });
    }
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
          const updated = lead.id ? leads.filter((l) => l.id !== lead.id) : leads.filter((_, idx) => idx !== editIdx);
          await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(updated));
          navigation.navigate('Dashboard', { user });
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title={isEditing ? 'Edit Lead' : 'Review Lead'} badge={lead.captureMethod === 'image' ? 'AI EXTRACTED' : 'MANUAL'} onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {!!lead.duplicateWarning && (
          <View style={s.warningBanner}><Text style={s.warningText}>{lead.duplicateWarning}</Text></View>
        )}


        {(lead.locationSource || lead.locationNeedsReview || lead.ocrSummary || (lead.reviewLabels || []).length) && (
          <Card>
            <Text style={s.infoTitle}>Capture Intelligence</Text>
            {(lead.reviewLabels || []).length > 0 && <Text style={s.infoText}>Labels: {(lead.reviewLabels || []).join(' • ')}</Text>}
            {!!lead.captureSourceType && <Text style={s.infoText}>Source-aware type: {lead.captureSourceType}</Text>}
            {!!lead.locationSource && <Text style={s.infoText}>Location source: {lead.locationSource}</Text>}
            {!!lead.locationConfidence && <Text style={s.infoText}>Confidence: {lead.locationConfidence}</Text>}
            {!!lead.matchedDisplayName && <Text style={s.infoText}>Matched place: {lead.matchedDisplayName}</Text>}
            {!!lead.locationNeedsReview && <Text style={s.infoWarn}>Needs Review: address or state should be confirmed before relying on this lead.</Text>}
            {(lead.reviewWarnings || []).map((warning, idx) => <Text key={idx} style={s.infoWarn}>{warning}</Text>)}
            {!!lead.ocrSummary && <Text style={s.infoText}>OCR clues: {lead.ocrSummary}</Text>}
          </Card>
        )}

        <SectionLabel>Business Info</SectionLabel>
        <Card>
          <FieldInput label="Business Name" value={lead.businessName} onChangeText={(v) => update('businessName', v)} />
          <View style={[s.row, { marginTop: 10 }]}>
            <FieldInput label="POC First Name" value={lead.pocFirst} onChangeText={(v) => update('pocFirst', v)} />
            <View style={{ width: 10 }} />
            <FieldInput label="POC Last Name" value={lead.pocLast} onChangeText={(v) => update('pocLast', v)} />
          </View>
        </Card>

        <SectionLabel>Contact</SectionLabel>
        <Card>
          <FieldInput label="Phone" value={lead.phone} onChangeText={(v) => update('phone', v)} keyboardType="phone-pad" />
          <View style={{ marginTop: 10 }}>
            <FieldInput label="Email" value={lead.email} onChangeText={(v) => update('email', v)} autoCapitalize="none" keyboardType="email-address" />
          </View>
        </Card>

        <SectionLabel>Address</SectionLabel>
        <Card>
          <View style={s.row}>
            <View style={{ width: 80 }}><FieldInput label="St #" value={lead.streetNumber} onChangeText={(v) => update('streetNumber', v)} /></View>
            <View style={{ width: 10 }} />
            <FieldInput label="Street Name" value={lead.streetName} onChangeText={(v) => update('streetName', v)} />
          </View>
          <View style={{ marginTop: 10 }}><FieldInput label="Address Line 2" value={lead.addressLine2} onChangeText={(v) => update('addressLine2', v)} /></View>
          <View style={[s.row, { marginTop: 10 }]}>
            <FieldInput label="City" value={lead.city} onChangeText={(v) => update('city', v)} />
            <View style={{ width: 10 }} />
            <View style={{ width: 60 }}><FieldInput label="State" value={lead.state} onChangeText={(v) => update('state', v.toUpperCase())} maxLength={2} /></View>
            <View style={{ width: 10 }} />
            <View style={{ width: 80 }}><FieldInput label="ZIP" value={lead.zip} onChangeText={(v) => update('zip', v)} keyboardType="numeric" /></View>
          </View>
        </Card>

        <SectionLabel>Classification</SectionLabel>
        <Card>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.pickerLabel}>Status</Text>
              <View style={s.pickerWrap}><Picker selectedValue={lead.status} onValueChange={(v) => update('status', v)} style={s.picker}>{STATUS_OPTIONS.map((o) => <Picker.Item key={o} label={o} value={o} color={COLORS.text} />)}</Picker></View>
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.pickerLabel}>Property Type</Text>
              <View style={[s.pickerWrap, { justifyContent: 'center', paddingHorizontal: 14 }]}><Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '700' }}>Commercial</Text></View>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={s.pickerLabel}>Industry Vertical</Text>
            <View style={s.pickerWrap}><Picker selectedValue={lead.vertical || 'Restaurant'} onValueChange={(v) => update('vertical', v)} style={s.picker}>{INDUSTRY_VERTICALS.map((o) => <Picker.Item key={o} label={o} value={o} color={COLORS.text} />)}</Picker></View>
          </View>
        </Card>

        {!isEditing && (
          <>
            <SectionLabel>Intro Settings</SectionLabel>
            <Card>
              <View style={s.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Auto-Send Introduction</Text>
                  <Text style={s.toggleSub}>{autoIntro ? 'Intro prompt shows automatically after saving' : 'Save quietly and decide later'}</Text>
                </View>
                <TouchableOpacity style={[s.toggle, autoIntro && s.toggleOn]} onPress={async () => { const next = !autoIntro; setAutoIntro(next); await AsyncStorage.setItem(AUTO_INTRO_KEY, String(next)); }}>
                  <View style={[s.toggleThumb, autoIntro && s.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
            </Card>
          </>
        )}

        <PrimaryButton title={isEditing ? 'Update Lead ✔' : 'Save to Queue ✔'} onPress={() => persistLead(false)} style={{ marginTop: 20 }} />
        {isEditing && <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}><Text style={s.deleteText}>Delete Lead</Text></TouchableOpacity>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  row: { flexDirection: 'row' },
  warningBanner: { marginTop: 16, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,107,43,0.35)', backgroundColor: 'rgba(255,107,43,0.08)' },
  warningText: { color: '#FFB98F', fontSize: 12 },
  pickerLabel: { fontSize: 11, fontWeight: '600', color: COLORS.label, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  pickerWrap: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10 },
  picker: { color: COLORS.text },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  toggleSub: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  toggle: { width: 56, height: 30, borderRadius: 999, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, padding: 3 },
  toggleOn: { backgroundColor: 'rgba(0,201,255,0.2)', borderColor: 'rgba(0,201,255,0.45)' },
  toggleThumb: { width: 22, height: 22, borderRadius: 999, backgroundColor: COLORS.muted },
  toggleThumbOn: { backgroundColor: COLORS.accent, marginLeft: 26 },
  deleteBtn: { marginTop: 14, alignItems: 'center', padding: 12 },
  deleteText: { color: COLORS.danger, fontWeight: '700' },
  infoTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  infoText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginBottom: 4 },
  infoWarn: { color: '#FFB98F', fontSize: 12, lineHeight: 18 },
});
