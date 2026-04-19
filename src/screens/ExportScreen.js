import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { COLORS } from '../constants';
import { ScreenHeader, Card, PrimaryButton, SecondaryButton, SectionLabel, StatusBadge } from '../components/UI';
import {
  LEAD_FIELDS,
  exportSalesTemplate,
  exportStandardSpreadsheet,
  exportUsingProfile,
  loadExportProfiles,
  loadLeads,
  pickCustomTemplate,
  saveExportProfiles,
} from '../utils/exportProfiles';
import { normalizeLead } from '../utils/leadProcessing';

export default function ExportScreen({ navigation, route }) {
  const { user } = route.params;
  const [leads, setLeads] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedMode, setSelectedMode] = useState('sales');
  const [selectedProfileName, setSelectedProfileName] = useState('');
  const [customDraft, setCustomDraft] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [statusText, setStatusText] = useState('');

  useFocusEffect(useCallback(() => {
    (async () => {
      const [storedLeads, storedProfiles] = await Promise.all([loadLeads(), loadExportProfiles()]);
      setLeads(storedLeads);
      setProfiles(storedProfiles);
      if (storedProfiles.length && !selectedProfileName) setSelectedProfileName(storedProfiles[0].name);
    })();
  }, [selectedProfileName]));

  const normalizedPreview = useMemo(() => leads.map((lead) => normalizeLead(lead, { fillNameDots: true })), [leads]);
  const selectedProfile = profiles.find((profile) => profile.name === selectedProfileName) || null;

  const handleExport = async () => {
    if (!leads.length) return;
    setExporting(true);
    setStatusText('Building export file...');
    try {
      if (selectedMode === 'standard') {
        await exportStandardSpreadsheet(normalizedPreview);
      } else if (selectedMode === 'sales') {
        await exportSalesTemplate(normalizedPreview, user);
      } else if (selectedMode === 'saved' && selectedProfile) {
        await exportUsingProfile(normalizedPreview, selectedProfile, user);
      } else if (selectedMode === 'custom' && customDraft) {
        const profile = {
          ...customDraft,
          name: customDraft.profileName || customDraft.asset.name || 'Custom Export',
          fileBaseName: customDraft.profileName || customDraft.asset.name?.replace(/\.[^.]+$/, '') || 'LeadLens_Custom_Export',
          sheetName: customDraft.firstSheetName || 'Export',
          templateUri: customDraft.asset.uri,
        };
        await exportUsingProfile(normalizedPreview, profile, user);
      } else {
        throw new Error('Choose an export mode first.');
      }
      setStatusText('Export complete.');
    } catch (error) {
      Alert.alert('Export failed', error.message || 'Could not build the export file.');
      setStatusText('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const handlePickTemplate = async () => {
    try {
      const picked = await pickCustomTemplate();
      if (!picked) return;
      setCustomDraft({ ...picked, profileName: picked.asset.name?.replace(/\.[^.]+$/, '') || 'Custom Export' });
      setSelectedMode('custom');
    } catch (error) {
      Alert.alert('Template issue', error.message || 'Could not read the custom template.');
    }
  };

  const handleSaveProfile = async () => {
    if (!customDraft) return;
    const name = String(customDraft.profileName || '').trim();
    if (!name) {
      Alert.alert('Profile name needed', 'Give this mapping profile a name before saving it.');
      return;
    }
    const nextProfiles = [
      ...profiles.filter((profile) => profile.name !== name),
      {
        name,
        headers: customDraft.headers,
        mapping: customDraft.mapping,
        templateUri: customDraft.asset.uri,
        fileBaseName: name,
        sheetName: customDraft.firstSheetName,
      },
    ];
    await saveExportProfiles(nextProfiles);
    setProfiles(nextProfiles);
    setSelectedProfileName(name);
    setSelectedMode('saved');
    Alert.alert('Profile saved', `${name} is ready for future exports.`);
  };

  const updateMapping = (header, fieldKey) => {
    setCustomDraft((draft) => ({
      ...draft,
      mapping: { ...draft.mapping, [header]: fieldKey },
    }));
  };

  return (
    <SafeAreaView style={s.root}>
      <ScreenHeader title="Export" badge={`${leads.length} READY`} onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 44 }}>
        <Card style={s.summaryCard} accent>
          <Text style={s.bigCount}>{leads.length}</Text>
          <Text style={s.bigCountLabel}>leads in queue</Text>
          <Text style={s.empInfo}>EMP {user.employeeNum} · Branch {user.branchNum}</Text>
        </Card>

        <SectionLabel>Export Mode</SectionLabel>
        <View style={s.modeGrid}>
          <ModeCard title="Sales Template" subtitle="Your current import format" active={selectedMode === 'sales'} onPress={() => setSelectedMode('sales')} />
          <ModeCard title="Standard Sheet" subtitle="General Excel file" active={selectedMode === 'standard'} onPress={() => setSelectedMode('standard')} />
          <ModeCard title="Saved Profile" subtitle="Reuse a custom mapping" active={selectedMode === 'saved'} onPress={() => setSelectedMode('saved')} />
          <ModeCard title="Custom Template" subtitle="Upload and map fields" active={selectedMode === 'custom'} onPress={() => setSelectedMode('custom')} />
        </View>

        {selectedMode === 'saved' && (
          <Card>
            <Text style={s.fieldTitle}>Saved mapping profile</Text>
            {profiles.length ? (
              <View style={s.pickerWrap}>
                <Picker selectedValue={selectedProfileName} onValueChange={setSelectedProfileName} style={s.picker} dropdownIconColor={COLORS.muted}>
                  {profiles.map((profile) => (
                    <Picker.Item key={profile.name} label={profile.name} value={profile.name} color={COLORS.text} />
                  ))}
                </Picker>
              </View>
            ) : (
              <Text style={s.helper}>No saved profiles yet. Upload a custom template and save one first. Software loves making you do setup before convenience arrives.</Text>
            )}
          </Card>
        )}

        <SectionLabel>Custom Template Mapping</SectionLabel>
        <Card>
          <TouchableOpacity style={s.uploadBtn} onPress={handlePickTemplate} activeOpacity={0.85}>
            <Text style={s.uploadIcon}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.uploadLabel}>{customDraft ? customDraft.asset.name : 'Upload custom Excel template'}</Text>
              <Text style={s.uploadSub}>Choose a template, map the fields you want, then save the profile if you like.</Text>
            </View>
          </TouchableOpacity>

          {customDraft && (
            <>
              <Text style={[s.fieldTitle, { marginTop: 14 }]}>Profile name</Text>
              <View style={s.profileNameRow}>
                <Text style={s.profileNameValue}>{customDraft.profileName}</Text>
                <SecondaryButton title="Save Profile" onPress={handleSaveProfile} style={{ flex: 0.45 }} />
              </View>
              <Text style={s.helper}>Auto-match gets you started, then you pick what goes where. Miracles remain unavailable.</Text>
              {customDraft.headers.map((header) => (
                <View key={header} style={s.mapRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.mapHeader}>{header}</Text>
                  </View>
                  <View style={s.mapPickerWrap}>
                    <Picker
                      selectedValue={customDraft.mapping[header] || 'skip'}
                      onValueChange={(value) => updateMapping(header, value)}
                      style={s.mapPicker}
                      dropdownIconColor={COLORS.muted}
                    >
                      {LEAD_FIELDS.map((field) => (
                        <Picker.Item key={field.key} label={field.label} value={field.key} color={COLORS.text} />
                      ))}
                    </Picker>
                  </View>
                </View>
              ))}
            </>
          )}
        </Card>

        <SectionLabel>Queue Preview</SectionLabel>
        {normalizedPreview.length === 0 ? (
          <Text style={s.empty}>Queue is empty. You need leads before exports become anything except decorative buttons.</Text>
        ) : (
          normalizedPreview.slice(0, 8).map((lead, index) => (
            <View key={lead.id || index} style={s.queueRow}>
              <Text style={s.rowNum}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rowBiz}>{lead.businessName || 'Unnamed Business'}</Text>
                <Text style={s.rowContact}>{[lead.pocFirst, lead.pocLast].filter(Boolean).join(' ')} · {lead.city || 'Unknown city'}{lead.state ? `, ${lead.state}` : ''}</Text>
              </View>
              <StatusBadge status={lead.status} />
            </View>
          ))
        )}

        <PrimaryButton title={exporting ? 'Exporting…' : 'Build Export File'} onPress={handleExport} disabled={exporting || !leads.length || (selectedMode === 'saved' && !selectedProfile) || (selectedMode === 'custom' && !customDraft)} style={{ marginTop: 20 }} />
        {!!statusText && <Text style={s.statusText}>{statusText}</Text>}
        {exporting && <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 14 }} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function ModeCard({ title, subtitle, active, onPress }) {
  return (
    <TouchableOpacity style={[s.modeCard, active && s.modeCardActive]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[s.modeTitle, active && s.modeTitleActive]}>{title}</Text>
      <Text style={s.modeSub}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  summaryCard: { marginTop: 16, alignItems: 'center' },
  bigCount: { fontSize: 52, fontWeight: '800', color: COLORS.accent },
  bigCountLabel: { color: COLORS.muted, fontSize: 13 },
  empInfo: { color: COLORS.muted, fontSize: 11, marginTop: 6 },
  modeGrid: { gap: 10 },
  modeCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 14,
  },
  modeCardActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(0,201,255,0.06)' },
  modeTitle: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  modeTitleActive: { color: COLORS.accent },
  modeSub: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  pickerWrap: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, overflow: 'hidden' },
  picker: { color: COLORS.text, height: 48 },
  uploadBtn: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  uploadIcon: { fontSize: 24 },
  uploadLabel: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  uploadSub: { color: COLORS.muted, fontSize: 12, marginTop: 3, lineHeight: 16 },
  fieldTitle: { color: COLORS.label, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '700', marginBottom: 8 },
  helper: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileNameValue: { flex: 1, color: COLORS.text, fontSize: 15, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  mapRow: { paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 12 },
  mapHeader: { color: COLORS.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  mapPickerWrap: { backgroundColor: COLORS.surface2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  mapPicker: { color: COLORS.text, height: 48 },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 16 },
  queueRow: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 },
  rowNum: { width: 24, color: COLORS.accent, fontWeight: '700' },
  rowBiz: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  rowContact: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  statusText: { textAlign: 'center', marginTop: 12, color: COLORS.muted, fontSize: 12 },
});
