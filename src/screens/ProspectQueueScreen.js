import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AppScreenBackground from '../components/AppScreenBackground';
import GlassCard from '../components/GlassCard';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { useFocusEffect } from '@react-navigation/native';
import { showThemedAlert } from '../components/ThemedAlert';
import { upsertProspect } from '../utils/backendSync';
import { matchLeadByAnyId, normalizeLead, sortQueueProspects } from '../utils/leadHelpers';
import { extractLeadsWithDebugFromImage } from '../utils/claudeApi';
import { checkPermitStatus } from '../utils/txPermitCheck';

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

const IMPORT_OPTIONS = [
  { key: 'gallery', label: 'Photo Gallery', icon: '🖼', desc: 'Import from photo library' },
  { key: 'camera', label: 'Take New Photo', icon: '📷', desc: 'Capture a new photo' },
  { key: 'documents', label: 'Documents / Files', icon: '📄', desc: 'Import from PDFs, documents' },
  { key: 'cloud', label: 'Cloud Storage', icon: '☁', desc: 'Connect to cloud drives' },
];

export default function ProspectQueueScreen({ navigation, route }) {
  const user = route?.params?.user || {};
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const scrollRef = useRef(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  const scrollTimerRef = useRef(null);
  const atBottomRef = useRef(false);
  const [permitFlags, setPermitFlags] = useState({}); // { [lead.id]: 'inactive' | 'not_found' }

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  // Run permit checks whenever leads change and the setting is enabled
  useEffect(() => {
    const runChecks = async () => {
      // Read the user's setting preference
      let prefEnabled = true;
      try {
        const raw = await AsyncStorage.getItem('lensSignalPrefs');
        if (raw) {
          const prefs = JSON.parse(raw);
          prefEnabled = prefs?.notify_priority_review ?? true;
        }
      } catch {}

      if (!prefEnabled) return;

      const flags = {};
      for (const lead of leads) {
        if (!lead.businessName) continue;
        const zip = lead.zip || lead.zipCode || null;
        const result = await checkPermitStatus(lead.businessName, zip);
        if (result.status === 'inactive' || result.status === 'not_found') {
          flags[lead.id] = result.status;
        }
      }
      setPermitFlags(flags);
    };

    if (leads.length > 0) runChecks();
  }, [leads]);

  const handleScroll = useCallback((e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const isAtBottom = distanceFromBottom < 20;
    atBottomRef.current = isAtBottom;
    if (isAtBottom && scrollLocked) {
      setScrollLocked(false);
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    }
  }, [scrollLocked]);

  const scrollToBottom = useCallback(() => {
    if (scrollLocked) return;
    if (atBottomRef.current) return;
    setScrollLocked(true);
    try {
      scrollRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      console.warn('[ProspectQueue] scrollToEnd failed:', e.message);
      setScrollLocked(false);
      return;
    }
    scrollTimerRef.current = setTimeout(() => {
      setScrollLocked(false);
    }, 800);
  }, [scrollLocked]);

  const loadLeads = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setLeads(parsed);
          return;
        }
      }
      setLeads([]);
    } catch (e) {
      console.warn('[ProspectQueue] Load failed:', e.message);
      setLeads([]);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    loadLeads().finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadLeads]));

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

      // Write to storage via storageBridge (MMKV)
      await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(currentLeads));

      // Read back to confirm write succeeded
      const readBackRaw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
      const readBack = readBackRaw ? JSON.parse(readBackRaw) : [];
      if (!Array.isArray(readBack) || readBack.length !== currentLeads.length) {
        showThemedAlert('Save Failed', 'Changes could not be saved to device storage. Please try again.');
        return;
      }

      const readBackIdx = matchLeadByAnyId(readBack, updatedLead);
      const readBackLead = readBackIdx !== -1 ? readBack[readBackIdx] : null;
      if (!readBackLead || readBackLead.updatedAt !== now) {
        showThemedAlert('Save Failed', 'Changes could not be verified on device. Please try again.');
        return;
      }

      // Confirmed — update state from storage read-back
      setLeads(readBack);

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

  const processAssets = async (assets, source) => {
    if (!assets?.length) return;
    setProcessing(true);
    setProcessingMsg(`Processing ${assets.length} file(s)...`);
    try {
      const allLeads = [];
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        setProcessingMsg(`Processing file ${i + 1} of ${assets.length}...`);
        await new Promise(r => setTimeout(r, 0));

        let b64, mime;
        try {
          b64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          mime = asset.mimeType || 'image/jpeg';
        } catch (readErr) {
          console.warn('[ProspectQueue] Read asset failed:', readErr.message);
          continue;
        }

        try {
          const debugExtraction = await extractLeadsWithDebugFromImage(b64, mime, { captureMethod: `import_${source}` });
          let extractedLeads = debugExtraction.leads?.length
            ? debugExtraction.leads
            : [];

          if (!extractedLeads.length && String(debugExtraction?.ocrSummary || '').trim()) {
            const firstLine = String(debugExtraction.ocrSummary)
              .split(/\n|\||•|·/)
              .map(l => String(l || '').trim())
              .find(Boolean) || 'Imported Lead';
            extractedLeads = [{
              businessName: firstLine,
              notes: 'OCR fallback candidate',
              confidence: 'low',
            }];
          }

          if (extractedLeads.length) {
            setProcessingMsg(`Found ${extractedLeads.length} prospect(s) in file ${i + 1}`);
            for (const lead of extractedLeads) {
              allLeads.push({
                ...normalizeLead(lead),
                captureMethod: `import_${source}`,
              });
            }
          }
        } catch (extractErr) {
          console.warn('[ProspectQueue] Extraction error:', extractErr.message);
        }
      }

      if (!allLeads.length) {
        showThemedAlert('No Prospects Found', 'Could not extract any prospect data from the selected files.');
        return;
      }

      setProcessingMsg(`${allLeads.length} prospects ready`);
      await new Promise(r => setTimeout(r, 120));

      setImportModalVisible(false);
      navigation.push('BatchReview', {
        user,
        leads: allLeads,
        sourceLabel: `Import — ${source} (${allLeads.length} prospect${allLeads.length !== 1 ? 's' : ''})`,
      });
    } catch (err) {
      console.error('[ProspectQueue] Process error:', err);
      showThemedAlert('Processing Failed', err.message || 'An unexpected error occurred during import.');
    } finally {
      setProcessing(false);
      setProcessingMsg('');
    }
  };

  const handleImportOption = async (key) => {
    setImportModalVisible(false);
    if (key === 'cloud') {
      showThemedAlert('Coming Soon', 'Cloud storage import will be available in a future update.');
      return;
    }

    try {
      if (key === 'gallery') {
        let permResult = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (permResult?.status !== 'granted') {
          permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (permResult?.status !== 'granted') {
            showThemedAlert('Permission Denied', 'Photo library access is required to import images.');
            return;
          }
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsEditing: false,
          allowsMultipleSelection: true,
          selectionLimit: 10,
          base64: false,
        });
        if (!result.canceled && result.assets?.length) {
          await processAssets(result.assets, 'gallery');
        }
      } else if (key === 'camera') {
        let permResult = await ImagePicker.getCameraPermissionsAsync();
        if (permResult?.status !== 'granted') {
          permResult = await ImagePicker.requestCameraPermissionsAsync();
          if (permResult?.status !== 'granted') {
            showThemedAlert('Permission Denied', 'Camera access is required to take photos.');
            return;
          }
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsEditing: false,
          base64: false,
        });
        if (!result.canceled && result.assets?.length) {
          await processAssets(result.assets, 'camera');
        }
      } else if (key === 'documents') {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            'image/*',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
          ],
          copyToCacheDirectory: true,
          multiple: true,
        });
        if (!result.canceled && result.assets?.length) {
          const imageAssets = result.assets.filter(a =>
            !a.mimeType || a.mimeType.startsWith('image/')
          );
          if (!imageAssets.length) {
            showThemedAlert('No Images Found', 'Please select image files for AI prospect extraction. Spreadsheet import is available from the Capture screen.');
            return;
          }
          await processAssets(imageAssets, 'documents');
        }
      }
    } catch (err) {
      console.error('[ProspectQueue] Import error:', err);
      showThemedAlert('Import Error', err.message || 'Could not complete import.');
    }
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
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.headerRow}>
            <Text style={styles.title}>Prospect Queue</Text>
            <TouchableOpacity style={styles.importBtn} onPress={() => setImportModalVisible(true)} activeOpacity={0.7}>
              <Text style={styles.importBtnIcon}>↓</Text>
              <Text style={styles.importBtnText}>Import</Text>
            </TouchableOpacity>
          </View>

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
                {lead.captureMethod && lead.captureMethod.startsWith('import_') && (
                  <View style={styles.sourceBadge}>
                    <Text style={styles.sourceBadgeText}>
                      {lead.captureMethod.replace('import_', 'Imported: ')}
                    </Text>
                  </View>
                )}
                {permitFlags[lead.id] && (
                  <View style={styles.permitWarningBadge}>
                    <Text style={styles.permitWarningText}>
                      ⚠️ {permitFlags[lead.id] === 'not_found' ? 'No TX permit found' : 'Inactive TX permit'}
                    </Text>
                  </View>
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

      {sortedLeads.length > 0 && (
        <TouchableOpacity
          style={[styles.skipToBottomBtn, scrollLocked && styles.skipToBottomBtnDisabled]}
          onPress={scrollToBottom}
          disabled={scrollLocked}
          activeOpacity={0.7}
        >
          <Text style={styles.skipToBottomText}>↓ Skip to Bottom</Text>
        </TouchableOpacity>
      )}

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

      <Modal visible={importModalVisible} animationType="slide" transparent onRequestClose={() => setImportModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Import Prospects</Text>
              {IMPORT_OPTIONS.map(opt => (
                <TouchableOpacity key={opt.key} style={styles.importOption} onPress={() => handleImportOption(opt.key)} activeOpacity={0.7}>
                  <Text style={styles.importOptionIcon}>{opt.icon}</Text>
                  <View style={styles.importOptionTextWrap}>
                    <Text style={styles.importOptionLabel}>{opt.label}</Text>
                    <Text style={styles.importOptionDesc}>{opt.desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setImportModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {processing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingBox}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.processingText}>{processingMsg}</Text>
          </View>
        </View>
      )}
    </AppScreenBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800' },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    gap: 6,
  },
  importBtnIcon: { color: '#000', fontSize: 16, fontWeight: '900' },
  importBtnText: { color: '#000', fontSize: 14, fontWeight: '800' },
  emptyText: { color: COLORS.muted, fontSize: 15, textAlign: 'center', marginTop: 40 },
  card: { marginBottom: 14 },
  cardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', marginBottom: 6 },
  cardText: { color: 'rgba(255,255,255,0.80)', fontSize: 14, marginBottom: 3 },
  updatedText: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  sourceBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: COLORS.purpleDim,
    borderWidth: 1,
    borderColor: COLORS.purple,
  },
  sourceBadgeText: { color: COLORS.purple, fontSize: 11, fontWeight: '600' },
  permitWarningBadge: {
    marginTop: 6,
    backgroundColor: 'rgba(255, 180, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 0, 0.5)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  permitWarningText: {
    fontSize: 11,
    color: '#FFB400',
    fontWeight: '600',
  },
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
  importOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  importOptionIcon: { fontSize: 24, marginRight: 14 },
  importOptionTextWrap: { flex: 1 },
  importOptionLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  importOptionDesc: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  processingBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    minWidth: 200,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  processingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
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
  skipToBottomBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    zIndex: 50,
    elevation: 8,
  },
  skipToBottomBtnDisabled: { opacity: 0.4 },
  skipToBottomText: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
});
