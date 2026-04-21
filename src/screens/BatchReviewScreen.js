import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { ScreenHeader, FieldInput, PrimaryButton, Card, SectionLabel, SecondaryButton } from '../components/UI';
import { applyRequiredPlaceholders, findDuplicateInLeads, inferVertical, normalizeLead } from '../utils/leadHelpers';

function buildTaggedLead(lead, user) {
  const normalized = normalizeLead(lead);
  const inferred = inferVertical(normalized);
  return applyRequiredPlaceholders({
    ...normalized,
    ...inferred,
    reviewed: true,
    id: normalized.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    repName: user.repName,
    employeeNum: user.employeeNum,
    branchNum: user.branchNum,
  });
}

export default function BatchReviewScreen({ navigation, route }) {
  const { user, leads: initialLeads = [], sourceLabel = 'Batch scan' } = route.params;
  const [leads, setLeads] = useState(initialLeads.map((lead) => ({
    ...normalizeLead(lead),
    keep: true,
    reviewed: false,
    ignoreDuplicate: false,
  })));

  const updateLead = (idx, key, value) => {
    setLeads((prev) => prev.map((lead, index) => index === idx ? { ...lead, [key]: value } : lead));
  };

  const removeLead = (idx) => {
    setLeads((prev) => prev.filter((_, index) => index !== idx));
  };

  const toggleKeep = (idx) => {
    setLeads((prev) => prev.map((lead, index) => index === idx ? { ...lead, keep: !lead.keep } : lead));
  };

  const saveAll = async () => {
    const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    const nextQueue = [...queue];
    const duplicates = [];
    const saved = [];

    for (const lead of leads.filter((item) => item.keep)) {
      const tagged = buildTaggedLead(lead, user);
      const duplicate = findDuplicateInLeads(tagged, nextQueue);
      if (duplicate && !lead.ignoreDuplicate) {
        duplicates.push({ lead: tagged, duplicate });
      } else {
        nextQueue.push({ ...tagged, duplicateWarning: duplicate ? `${duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate'}: ${duplicate.reason}` : '' });
        saved.push(tagged);
      }
    }

    if (duplicates.length) {
      Alert.alert(
        'Duplicates detected',
        `${duplicates.length} lead(s) look like duplicates already in your queue. Review them and tap “Keep anyway” if you still want them saved.`,
      );
      setLeads((prev) => prev.map((lead) => {
        const hit = duplicates.find((item) => item.lead.businessName === lead.businessName && item.lead.phone === lead.phone && item.lead.email === lead.email);
        return hit ? { ...lead, duplicateWarning: `${hit.duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate'}: ${hit.duplicate.reason}` } : lead;
      }));
    }

    if (!saved.length) return;
    await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(nextQueue));
    Alert.alert('Batch saved', `${saved.length} lead(s) added to queue.` , [
      { text: 'Done', onPress: () => navigation.navigate('Dashboard', { user }) },
    ]);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Batch Review" badge={`${leads.length} FOUND`} onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        <Card accent>
          <Text style={s.introTitle}>{sourceLabel}</Text>
          <Text style={s.introText}>Review each extracted lead, remove junk entries, and save only what you want.</Text>
        </Card>

        {leads.map((lead, idx) => (
          <Card key={`${lead.businessName || 'lead'}_${idx}`} style={!lead.keep ? s.dimmedCard : null}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>Lead {idx + 1}</Text>
              <View style={s.cardHeaderRight}>
                <TouchableOpacity onPress={() => toggleKeep(idx)}>
                  <Text style={[s.keepToggle, !lead.keep && s.keepToggleOff]}>{lead.keep ? 'KEEP' : 'SKIP'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeLead(idx)}>
                  <Text style={s.removeText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!!lead.duplicateWarning && (
              <View style={s.warningBox}>
                <Text style={s.warningText}>{lead.duplicateWarning}</Text>
                <TouchableOpacity onPress={() => updateLead(idx, 'ignoreDuplicate', !lead.ignoreDuplicate)}>
                  <Text style={s.keepAnyway}>{lead.ignoreDuplicate ? 'Duplicate allowed' : 'Keep anyway'}</Text>
                </TouchableOpacity>
              </View>
            )}


            {((lead.reviewLabels || []).length > 0 || lead.locationSource || lead.locationNeedsReview) && (
              <View style={s.warningBox}>
                {(lead.reviewLabels || []).length > 0 && <Text style={s.warningText}>Labels: {(lead.reviewLabels || []).join(' • ')}</Text>}
                <Text style={s.warningText}>Location: {lead.locationSource || 'capture'} · Confidence: {lead.locationConfidence || lead.confidence || 'low'}</Text>
                {!!lead.locationNeedsReview && <Text style={s.keepAnyway}>Address needs review before save</Text>}
                {(lead.reviewWarnings || []).map((warning, idx) => <Text key={idx} style={s.keepAnyway}>{warning}</Text>)}
              </View>
            )}

            <FieldInput label="Business Name" value={lead.businessName} onChangeText={(v) => updateLead(idx, 'businessName', v)} />
            <View style={s.row}>
              <FieldInput label="First Name" value={lead.pocFirst} onChangeText={(v) => updateLead(idx, 'pocFirst', v)} />
              <View style={{ width: 10 }} />
              <FieldInput label="Last Name" value={lead.pocLast} onChangeText={(v) => updateLead(idx, 'pocLast', v)} />
            </View>
            <View style={s.row}>
              <FieldInput label="Phone" value={lead.phone} onChangeText={(v) => updateLead(idx, 'phone', v)} />
              <View style={{ width: 10 }} />
              <FieldInput label="Email" value={lead.email} onChangeText={(v) => updateLead(idx, 'email', v)} />
            </View>
            <View style={s.row}>
              <FieldInput label="Street #" value={lead.streetNumber} onChangeText={(v) => updateLead(idx, 'streetNumber', v)} />
              <View style={{ width: 10 }} />
              <FieldInput label="Street Name" value={lead.streetName} onChangeText={(v) => updateLead(idx, 'streetName', v)} />
            </View>
            <View style={s.row}>
              <FieldInput label="City" value={lead.city} onChangeText={(v) => updateLead(idx, 'city', v)} />
              <View style={{ width: 10 }} />
              <FieldInput label="State" value={lead.state} onChangeText={(v) => updateLead(idx, 'state', v)} />
              <View style={{ width: 10 }} />
              <FieldInput label="ZIP" value={lead.zip} onChangeText={(v) => updateLead(idx, 'zip', v)} />
            </View>
          </Card>
        ))}

        <SectionLabel>Actions</SectionLabel>
        <PrimaryButton title="Save Selected Leads" onPress={saveAll} />
        <SecondaryButton title="Back to Scan" onPress={() => navigation.goBack()} style={{ marginTop: 10 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  introTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  introText: { color: COLORS.muted, marginTop: 4, fontSize: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardTitle: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
  keepToggle: { color: COLORS.success, fontSize: 12, fontWeight: '700' },
  keepToggleOff: { color: COLORS.muted },
  removeText: { color: COLORS.danger, fontSize: 12, fontWeight: '700' },
  dimmedCard: { opacity: 0.55 },
  warningBox: {
    borderWidth: 1,
    borderColor: 'rgba(255,107,43,0.35)',
    backgroundColor: 'rgba(255,107,43,0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  warningText: { color: '#FFB98F', fontSize: 12 },
  keepAnyway: { color: COLORS.accent, fontWeight: '700', marginTop: 6, fontSize: 12 },
  row: { flexDirection: 'row', marginTop: 10 },
});
