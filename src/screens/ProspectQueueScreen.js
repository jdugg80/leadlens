import React, { useState, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
  View,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AppScreenBackground from '../components/AppScreenBackground';
import GlassCard from '../components/GlassCard';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { useFocusEffect } from '@react-navigation/native';
import { showThemedAlert } from '../components/ThemedAlert';
import { upsertProspect } from '../utils/backendSync';
import { matchLeadByAnyId, sortQueueProspects } from '../utils/leadHelpers';

const emptyForm = {
  businessName: '',
  phone: '',
  email: '',
  streetNumber: '',
  streetName: '',
  city: '',
  state: '',
  zip: '',
  notes: '',
};

export default function ProspectQueueScreen({ navigation, route }) {
  const user = route?.params?.user || {};
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let rawLeads = [];
      try {
        const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) rawLeads = parsed;
        }
      } catch (e) {
        console.warn('[ProspectQueue] Load failed:', e.message);
      }
      if (active) {
        setLeads(rawLeads);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []));

  const openEdit = (lead, idx) => {
    setEditingLead(lead);
    setEditingIndex(idx);
    setForm({
      businessName: lead.businessName || '',
      phone: lead.phone || '',
      email: lead.email || '',
      streetNumber: lead.streetNumber || '',
      streetName: lead.streetName || '',
      city: lead.city || '',
      state: lead.state || '',
      zip: lead.zip || '',
      notes: lead.notes || '',
    });
    setEditModalVisible(true);
  };

  const closeEdit = () => {
    setEditModalVisible(false);
    setEditingLead(null);
    setEditingIndex(null);
    setForm({ ...emptyForm });
  };

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!editingLead) return;
    setSaving(true);
    try {
      let currentLeads = [];
      try {
        const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) currentLeads = parsed;
        }
      } catch (e) {
        console.warn('[ProspectQueue] Re-read failed:', e.message);
      }

      const now = new Date().toISOString();
      const updatedLead = {
        ...editingLead,
        businessName: form.businessName,
        phone: form.phone,
        email: form.email,
        streetNumber: form.streetNumber,
        streetName: form.streetName,
        city: form.city,
        state: form.state,
        zip: form.zip,
        notes: form.notes,
        updatedAt: now,
        lastEditedAt: now,
        reviewedAt: editingLead.reviewedAt || now,
        queueSortGroup: 1,
      };

      const storageIdx = matchLeadByAnyId(currentLeads, editingLead);
      if (storageIdx !== -1) {
        currentLeads.splice(storageIdx, 1);
      }
      currentLeads.push(updatedLead);

      setLeads(currentLeads);

      const RawStorageSave = require('@react-native-async-storage/async-storage').default;
      await RawStorageSave.setItem(LEADS_STORAGE_KEY, JSON.stringify(currentLeads));
      AsyncStorage.setSync(LEADS_STORAGE_KEY, JSON.stringify(currentLeads));

      const supaRaw = await AsyncStorage.getItem('@leadlens_supabase_settings');
      const settings = supaRaw ? JSON.parse(supaRaw) : {};
      const syncResult = await upsertProspect(updatedLead, user, settings);
      if (!syncResult?.ok) {
        console.warn('[ProspectQueue] Supabase sync issue:', syncResult?.reason);
        showThemedAlert('Saved Locally', `Data saved on device, but cloud sync issue: ${syncResult?.reason || 'unknown'}. It will sync later.`);
      }

      closeEdit();
    } catch (err) {
      console.error('[ProspectQueue] Save error:', err);
      showThemedAlert('Save Failed', err.message || 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleLookup = async (lead) => {
    const query = [lead.businessName, lead.city, 'pest control phone address']
      .filter(Boolean)
      .join(' ');
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showThemedAlert('Cannot Open Browser', 'Unable to open Google Search on this device.');
      }
    } catch (err) {
      showThemedAlert('Could not open browser', err.message || 'An unexpected error occurred.');
    }
  };

  const needsLookup = (lead) => {
    const hasAddress = !!(lead.streetName || lead.streetNumber || lead.city || lead.streetAddress || lead.fullAddress || lead.formattedAddress);
    const hasPhone = !!(lead.phone);
    return !hasAddress || !hasPhone;
  };

  const sortedLeads = sortQueueProspects(leads);

  if (loading) {
    return (
      <AppScreenBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        </SafeAreaView>
      </AppScreenBackground>
    );
  }

  return (
    <AppScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Prospect Queue</Text>

          {sortedLeads.length === 0 && (
            <Text style={styles.emptyText}>No prospects in queue.</Text>
          )}

          {sortedLeads.map((lead, idx) => (
            <GlassCard key={lead.id || `lead_${idx}`} style={styles.card}>
              <TouchableOpacity onPress={() => openEdit(lead, idx)} activeOpacity={0.7}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {lead.businessName || 'Unnamed Business'}
                </Text>
                {lead.phone && <Text style={styles.cardText}>Phone: {lead.phone}</Text>}
                {lead.email && <Text style={styles.cardText}>Email: {lead.email}</Text>}
                {(lead.streetName || lead.city) && (
                  <Text style={styles.cardText}>
                    {[lead.streetNumber, lead.streetName, lead.city, lead.state].filter(Boolean).join(', ')}
                  </Text>
                )}
                {lead.updatedAt && (
                  <Text style={styles.updatedText}>
                    Edited: {new Date(lead.updatedAt).toLocaleDateString()}
                  </Text>
                )}
                {needsLookup(lead) && (
                  <TouchableOpacity style={styles.googleBtn} onPress={() => handleGoogleLookup(lead)} activeOpacity={0.7}>
                    <Text style={styles.googleBtnIcon}>🔍</Text>
                    <Text style={styles.googleBtnText}>Google Lookup</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </GlassCard>
          ))}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={closeEdit}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContainer}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Prospect</Text>

              <Text style={styles.fieldLabel}>Business Name</Text>
              <TextInput style={styles.input} value={form.businessName} onChangeText={v => updateField('businessName', v)} placeholderTextColor={COLORS.muted} placeholder="Business name" />

              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput style={styles.input} value={form.phone} onChangeText={v => updateField('phone', v)} placeholderTextColor={COLORS.muted} placeholder="Phone number" keyboardType="phone-pad" />

              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput style={styles.input} value={form.email} onChangeText={v => updateField('email', v)} placeholderTextColor={COLORS.muted} placeholder="Email address" keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.fieldLabel}>Street Number</Text>
              <TextInput style={styles.input} value={form.streetNumber} onChangeText={v => updateField('streetNumber', v)} placeholderTextColor={COLORS.muted} placeholder="Street number" />

              <Text style={styles.fieldLabel}>Street Name</Text>
              <TextInput style={styles.input} value={form.streetName} onChangeText={v => updateField('streetName', v)} placeholderTextColor={COLORS.muted} placeholder="Street name" />

              <Text style={styles.fieldLabel}>City</Text>
              <TextInput style={styles.input} value={form.city} onChangeText={v => updateField('city', v)} placeholderTextColor={COLORS.muted} placeholder="City" />

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>State</Text>
                  <TextInput style={styles.input} value={form.state} onChangeText={v => updateField('state', v)} placeholderTextColor={COLORS.muted} placeholder="State" maxLength={2} autoCapitalize="characters" />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>ZIP</Text>
                  <TextInput style={styles.input} value={form.zip} onChangeText={v => updateField('zip', v)} placeholderTextColor={COLORS.muted} placeholder="ZIP" keyboardType="number-pad" maxLength={5} />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput style={[styles.input, styles.notesInput]} value={form.notes} onChangeText={v => updateField('notes', v)} placeholderTextColor={COLORS.muted} placeholder="Notes" multiline numberOfLines={3} />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeEdit} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginBottom: 16 },
  emptyText: { color: COLORS.muted, fontSize: 15, textAlign: 'center', marginTop: 40 },
  card: { marginBottom: 14 },
  cardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 6 },
  cardText: { color: 'rgba(255,255,255,0.80)', fontSize: 14, marginBottom: 3 },
  updatedText: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,201,255,0.1)',
  },
  googleBtnIcon: { fontSize: 13, marginRight: 6 },
  googleBtnText: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 8,
  },
  modalContent: { padding: 20, paddingBottom: 12 },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 20 },
  fieldLabel: { color: COLORS.chrome, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: COLORS.surface,
    color: '#FFFFFF',
    fontSize: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelBtnText: { color: COLORS.muted, fontWeight: '700', fontSize: 15 },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
});
