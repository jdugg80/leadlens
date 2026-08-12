import { useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  SafeAreaView,
  Modal,
  Pressable,
  Switch,
} from 'react-native';
import { syncAllProspectsToSupabase, enqueueSyncAll } from '../utils/backendSync';
import { storageBridge as AsyncStorage, mergeWithFreshUserProfile } from '../utils/storage';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { COLORS, EXPORT_MODES, LEADS_STORAGE_KEY, USER_STORAGE_KEY } from '../constants';
import {
  ScreenHeader,
  Card,
  PrimaryButton,
  SecondaryButton,
  SectionLabel,
  StatusBadge,
} from '../components/UI';
import {
  LEAD_FIELDS,
  exportSalesTemplate,
  exportStandardSpreadsheet,
  exportUsingProfile,
  loadExportProfiles,
  loadLeads,
  pickCustomTemplate,
  saveExportProfiles,
  saveLeads,
  buildSalesTemplateFile,
  buildStandardSpreadsheetFile,
  buildProfileExportFile,
} from '../utils/exportProfiles';
import { playSoundEffect } from '../utils/soundManager';
import { normalizeLead } from '../utils/leadProcessing';
import { getExportSettings } from '../utils/templateSettings';
import { recordUserActivityEvent } from '../utils/userLearning';
import { sendBackendEmail } from '../utils/backendEmail';
import { uploadExportAndGetLink } from '../utils/exportUpload';
import { showThemedAlert } from '../components/ThemedAlert';
import { getStyledMessage } from '../utils/aiPersonality';
import { processQueue } from '../utils/taskRunner';
import BetaTracker from '../../utils/betaTracker';

const BACKEND_EMAIL_SETTINGS_KEY = 'BACKEND_EMAIL_SETTINGS';

const CUSTOM_TEMPLATE_FIELD_OPTIONS = [
  { label: 'Do not map', key: null },
  { label: 'Business Name', key: 'businessName' },
  { label: 'First Name', key: 'pocFirst' },
  { label: 'Last Name', key: 'pocLast' },
  { label: 'Phone', key: 'phone' },
  { label: 'Phone Type', key: 'phoneType' },
  { label: 'Email', key: 'email' },
  { label: 'Street Number', key: 'streetNumber' },
  { label: 'Street Name', key: 'streetName' },
  { label: 'Address Line 2', key: 'addressLine2' },
  { label: 'City', key: 'city' },
  { label: 'State', key: 'state' },
  { label: 'Zip', key: 'zip' },
  { label: 'Employee #', key: 'employeeNum' },
  { label: 'Branch / Dept / Team', key: 'branchNum' },
  { label: 'Status', key: 'status' },
  { label: 'Property Type', key: 'propertyType' },
  { label: 'Fixed: Commercial', key: 'static:Commercial' },
  { label: 'Fixed: Work', key: 'static:Work' },
  { label: 'Fixed: Suspect', key: 'static:Suspect' },
  { label: 'Custom Fixed Value', key: 'customFixed' },
];

export default function ExportScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('ExportScreen');
  }, []);

  const routeUser = route.params?.user || {};
  const [user, setUser] = useState(routeUser);
  const [leads, setLeads] = useState([]);
  const prospects = leads; // alias for UI references
  const [profiles, setProfiles] = useState([]);
  const [selectedMode, setSelectedMode] = useState('standard');
  const [selectedProfileName, setSelectedProfileName] = useState('');
  const [customDraft, setCustomDraft] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [statusText, setStatusText] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        // Load latest user profile from AsyncStorage in case it was edited in settings
        try {
          const rawUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
          if (rawUser) {
            const parsed = JSON.parse(rawUser);
            if (parsed) {
              setUser(parsed);
            }
          }
        } catch (e) {
          console.warn('[ExportScreen] Failed to load latest user profile:', e);
        }

        const [storedLeads, storedProfiles, exportSettings] = await Promise.all([
          loadLeads(),
          loadExportProfiles(),
          getExportSettings(),
        ]);

        setLeads(storedLeads);
        setProfiles(storedProfiles);

        if (exportSettings.mode === EXPORT_MODES.SALES_TEMPLATE) {
          setSelectedMode('standard');
          setSelectedProfileName('');
          setCustomDraft(null);
        } else if (exportSettings.mode === EXPORT_MODES.CUSTOM && exportSettings.profileName) {
          setSelectedMode('saved');
          setSelectedProfileName(exportSettings.profileName);
          setCustomDraft(null);
        } else {
          setSelectedMode('standard');
          if (storedProfiles.length && !selectedProfileName) {
            setSelectedProfileName(storedProfiles[0].name);
          }
        }
      })();
    }, [selectedProfileName])
  );

  const normalizedPreview = useMemo(
    () => prospects.map((lead) => normalizeLead(lead, { fillNameDots: true })),
    [leads]
  );

  const selectedProfile =
    profiles.find((profile) => profile.name === selectedProfileName) || null;

  const buildSelectedExportFile = async () => {
    if (selectedMode === 'standard') {
      return buildStandardSpreadsheetFile(normalizedPreview, user);
    }

    if (selectedMode === 'sales_template') {
      return buildSalesTemplateFile(normalizedPreview, user);
    }

    if (selectedMode === 'saved' && selectedProfile) {
      return buildProfileExportFile(normalizedPreview, selectedProfile, user);
    }

    if (selectedMode === 'custom' && customDraft) {
      const profile = {
        ...customDraft,
        name:
          customDraft.profileName ||
          customDraft.asset.name ||
          'Custom Export',
        fileBaseName:
          customDraft.profileName ||
          customDraft.asset.name?.replace(/\.[^.]+$/, '') ||
          'LeadLens_Custom_Export',
        sheetName: customDraft.firstSheetName || 'Export',
        templateUri: customDraft.asset.uri,
      };
      return buildProfileExportFile(normalizedPreview, profile, user);
    }

    throw new Error('Choose an export mode first.');
  };

  const handleExport = async () => {
  if (!prospects.length) return;

  setExporting(true);
  setStatusText('Building export file...');
  BetaTracker.track('feature_use', { feature: 'Export', action: 'export_started', screen: 'ExportScreen' });

  const exportUser = mergeWithFreshUserProfile(user);

  try {
    if (selectedMode === 'standard') {
      await exportStandardSpreadsheet(normalizedPreview, exportUser);
    } else if (selectedMode === 'sales_template') {
      await exportSalesTemplate(normalizedPreview, exportUser);
    } else if (selectedMode === 'saved' && selectedProfile) {
      await exportUsingProfile(normalizedPreview, selectedProfile, exportUser);
    } else if (selectedMode === 'custom' && customDraft) {
      const profile = {
        ...customDraft,
        name:
          customDraft.profileName ||
          customDraft.asset?.name ||
          'Custom Export',
        fileBaseName:
          customDraft.profileName ||
          customDraft.asset?.name?.replace(/\.[^/.]+$/, '') ||
          'Custom Export',
      };

      await exportUsingProfile(normalizedPreview, profile, exportUser);
    }

    await playSoundEffect('export-created');
    recordUserActivityEvent('export_created', {
      mode: selectedMode,
      prospect_count: normalizedPreview.length
    }).catch(() => {});

    normalizedPreview.forEach(lead => {
      recordUserActivityEvent('prospect_exported', {
        prospect_id: lead.id,
        zip: lead.zip,
        business_type: lead.vertical || lead.industry || lead.businessType
      }).catch(() => {});
    });
    setStatusText('Export built. Syncing prospects to Supabase...');

    try {
      // Background-safe sync: enqueue it
      await enqueueSyncAll();
      processQueue().catch((err) => console.warn('[Export] processQueue failed:', err));

      const msg = await getStyledMessage('exportCreated');
      setStatusText(
        msg || 'Export complete. Syncing in background...'
      );

      // Still attempt immediate sync for better UX if app is in focus
      const syncResult = await syncAllProspectsToSupabase(exportUser);
      if (syncResult.ok) {
        setStatusText(msg || `Export complete. ${syncResult.count} prospects synced to Supabase.`);
        BetaTracker.track('feature_use', { feature: 'Export', action: 'export_completed', screen: 'ExportScreen' });
      }
    } catch (syncError) {
    BetaTracker.crash('ExportScreen', syncError);
      console.error('[ExportScreen] Supabase sync failed:', syncError);
      setStatusText(
        `Export complete. Syncing will continue in background.`
      );
    }
    maybeClearQueueAfterExport(normalizedPreview);
  } catch (error) {
    BetaTracker.crash('ExportScreen', error);
    console.error('[ExportScreen] Export failed:', error);
    playSoundEffect('error').catch(() => {});
    setStatusText(
      error?.message || 'Export failed. Please try again.'
    );
  } finally {
    setExporting(false);
  }
};

  const handleSendBackendEmail = async () => {
    if (!prospects.length) {
      showThemedAlert(
        'Nothing to send',
        'There are no prospects in queue to send right now.'
      );
      return;
    }

    setExporting(true);

    try {
      const raw = await AsyncStorage.getItem(BACKEND_EMAIL_SETTINGS_KEY);
      const settings = raw ? JSON.parse(raw) : null;

      if (!settings?.enabled) {
        throw new Error('Backend email is disabled in Settings.');
      }

      if (!settings?.endpoint || !settings?.recipient) {
        throw new Error('Missing backend endpoint or recipient in Settings.');
      }

      setStatusText('Building export file...');
      const fileUri = await buildSelectedExportFile();

      setStatusText('Uploading export...');
      const leadCount = normalizedPreview.length;
      const { publicUrl } = await uploadExportAndGetLink(fileUri, leadCount);
      const subject =
        settings.subject || `LeadLens Export (${leadCount} prospects)`;

      const html =
        `${settings.htmlBody || '<strong>Your LeadLens export is ready.</strong>'}` +
        `<br /><br />Queued leads: ${leadCount}` +
        `<br /><br /><a href="${publicUrl}">Download Export</a>`;

      const text =
        `Your LeadLens export is ready.\n\nQueued leads: ${leadCount}\n\nDownload: ${publicUrl}`;

      setStatusText('Sending backend email...');
      await sendBackendEmail({
        endpoint: settings.endpoint,
        to: settings.recipient,
        subject,
        html,
        text,
      });

      setStatusText('Export delivered.');
      await playSoundEffect('export-sent');

      (prospects || []).forEach((lead) => {
        recordUserActivityEvent('export_sent', {
          prospect_id: lead.id,
          zip_code: lead.zip,
          business_type: lead.vertical || lead.industry || lead.businessType || null,
        }).catch(() => {});
      });

      const msg = await getStyledMessage('exportSent');
      showThemedAlert('Success', msg || 'Export uploaded and backend email sent.');
      maybeClearQueueAfterExport(prospects);
    } catch (error) {
    BetaTracker.crash('ExportScreen', error);
      playSoundEffect('error').catch(() => {});
      setStatusText('Export delivery failed.');
      showThemedAlert(
        'Export Delivery Failed',
        error?.message || 'Unknown error'
      );
    } finally {
      setExporting(false);
    }
  };

  const handlePickTemplate = async () => {
    try {
      const picked = await pickCustomTemplate();
      if (!picked) return;
      setCustomDraft({
        ...picked,
        profileName:
          picked.asset.name?.replace(/\.[^.]+$/, '') || 'Custom Export',
      });
      setSelectedMode('custom');
    } catch (error) {
    BetaTracker.crash('ExportScreen', error);
      showThemedAlert(
        'Template issue',
        error.message || 'Could not read the custom template.'
      );
    }
  };

  const handleSaveProfile = async () => {
    if (!customDraft) return;

    const name = String(customDraft.profileName || '').trim();
    if (!name) {
      showThemedAlert(
        'Profile name needed',
        'Give this mapping profile a name before saving it.'
      );
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
    showThemedAlert('Profile saved', `${name} is ready for future exports.`);
  };

  const [mappingPickerOpen, setMappingPickerOpen] = useState(false);
  const [activeTemplateColumn, setActiveTemplateColumn] = useState(null);
  const [customFixedValueOpen, setCustomFixedValueOpen] = useState(false);
  const [customFixedValueText, setCustomFixedValueText] = useState('');
  const [clearQueueAfterExport, setClearQueueAfterExport] = useState(false);

  const getLeadId = (lead = {}) =>
    String(
      lead?.id ||
      lead?.leadId ||
      lead?.queueId ||
      lead?.createdAt ||
      lead?.savedAt ||
      ''
    ).trim();

  const clearExportedQueueItems = async (exportedLeads = []) => {
    const exportedIds = new Set(
      (exportedLeads || [])
        .map(getLeadId)
        .filter(Boolean)
    );

    let nextQueue = leads;
    if (exportedIds.size > 0 && exportedIds.size !== leads.length) {
      nextQueue = leads.filter((lead) => !exportedIds.has(getLeadId(lead)));
    } else if (exportedLeads.length === leads.length) {
      nextQueue = [];
    }

    setLeads(nextQueue);
    await saveLeads(nextQueue);
    // Also clear AsyncStorage backup — without this, leads reappear if MMKV
    // ever resets (e.g. Expo dev client rebuild). See SettingsScreen.handleClearQueue
    // for the same pattern.
    await AsyncStorage.removeItem(LEADS_STORAGE_KEY).catch((err) =>
      console.warn('[Export] Failed to clear AsyncStorage backup after export:', err)
    );
    setStatusText('Export complete. Queue cleared.');
  };

  const maybeClearQueueAfterExport = async (exportedLeads = []) => {
    if (!clearQueueAfterExport) return;

    const exportedCount = Array.isArray(exportedLeads)
      ? exportedLeads.length
      : 0;
    if (exportedCount === 0) return;

    showThemedAlert(
      'Clear exported queue?',
      'Your export was successful. Do you want to clear the exported leads from the queue?',
      [
        { text: 'Keep Queue', style: 'cancel' },
        {
          text: 'Clear Queue',
          style: 'destructive',
          onPress: async () => {
            await clearExportedQueueItems(exportedLeads);
          },
        },
      ]
    );
  };

  const openMappingPicker = (columnName) => {
    setActiveTemplateColumn(columnName);
    setMappingPickerOpen(true);
  };

  const selectMapping = (fieldKey) => {
    if (fieldKey === 'customFixed') {
      setMappingPickerOpen(false);
      setCustomFixedValueText('');
      setCustomFixedValueOpen(true);
      return;
    }

    if (activeTemplateColumn) {
      updateMapping(activeTemplateColumn, fieldKey);
    }
    setMappingPickerOpen(false);
    setActiveTemplateColumn(null);
  };

  const saveCustomFixedValue = () => {
    if (!activeTemplateColumn) {
      setCustomFixedValueOpen(false);
      return;
    }

    const value = String(customFixedValueText || '').trim();
    if (value) {
      updateMapping(activeTemplateColumn, `static:${value}`);
    }

    setCustomFixedValueOpen(false);
    setCustomFixedValueText('');
    setActiveTemplateColumn(null);
  };

  const getMappingLabel = (fieldKey) => {
    if (!fieldKey || fieldKey === 'skip') {
      return 'Do not map';
    }

    if (String(fieldKey).startsWith('static:')) {
      return `Fixed: ${String(fieldKey).slice('static:'.length)}`;
    }

    const option = CUSTOM_TEMPLATE_FIELD_OPTIONS.find(
      (opt) => opt.key === fieldKey
    );

    return option?.label || 'Do not map';
  };

  const updateMapping = (header, fieldKey) => {
    setCustomDraft((draft) => ({
      ...draft,
      mapping: { ...draft.mapping, [header]: fieldKey },
    }));
  };

  return (
    <SafeAreaView style={s.root}>
      <ScreenHeader
        title="Export"
        badge={`${prospects.length} READY`}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 44 }}
      >
        <Card style={s.summaryCard} accent>
          <Text style={s.bigCount}>{prospects.length}</Text>
          <Text style={s.bigCountLabel}>prospects in queue</Text>
          <Text style={s.empInfo}>
            EMP {user.employeeNum} · Branch {user.branchNum}
          </Text>
        </Card>

        <SectionLabel>Export Mode</SectionLabel>
        <View style={s.modeGrid}>
          <ModeCard
            title="Standard Sheet"
            subtitle="General LeadLens layout"
            active={selectedMode === 'standard'}
            onPress={() => setSelectedMode('standard')}
          />
          <ModeCard
            title="Sales Module"
            subtitle="Official Import Template"
            active={selectedMode === 'sales_template'}
            onPress={() => setSelectedMode('sales_template')}
          />
          <ModeCard
            title="Saved Profile"
            subtitle="Reuse a custom mapping"
            active={selectedMode === 'saved'}
            onPress={() => setSelectedMode('saved')}
          />
          <ModeCard
            title="Custom Template"
            subtitle="Upload and map new fields"
            active={selectedMode === 'custom'}
            onPress={() => setSelectedMode('custom')}
          />
        </View>

        {selectedMode === 'saved' && (
          <Card>
            <Text style={s.fieldTitle}>Saved Templates</Text>
            {profiles.length ? (
              <>
                {profiles.map((profile) => (
                  <TouchableOpacity
                    key={profile.name}
                    style={[s.profileRow, selectedProfileName === profile.name && s.profileRowActive]}
                    onPress={() => setSelectedProfileName(profile.name)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.profileRowName, selectedProfileName === profile.name && s.profileRowNameActive]}>
                        {profile.name}
                      </Text>
                      <Text style={s.profileRowSub}>
                        {profile.headers?.length || 0} columns · {profile.templateUri ? 'Custom template' : 'Standard mapping'}
                      </Text>
                    </View>
                    {selectedProfileName === profile.name && (
                      <Text style={s.profileRowCheck}>✓</Text>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        showThemedAlert(
                          `Delete "${profile.name}"?`,
                          'This cannot be undone.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete', style: 'destructive',
                              onPress: async () => {
                                const updated = profiles.filter(p => p.name !== profile.name);
                                await saveExportProfiles(updated);
                                setProfiles(updated);
                                if (selectedProfileName === profile.name) {
                                  setSelectedProfileName(updated[0]?.name || '');
                                }
                              },
                            },
                          ]
                        );
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginLeft: 8 }}
                    >
                      <Text style={{ color: COLORS.danger, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <Text style={s.helper}>
                No saved templates yet. Map a custom template below and save it.
              </Text>
            )}
          </Card>
        )}

        <SectionLabel>Custom Template Mapping</SectionLabel>
        <Card>
          <TouchableOpacity
            style={s.uploadBtn}
            onPress={handlePickTemplate}
            activeOpacity={0.85}
          >
            <Text style={s.uploadIcon}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.uploadLabel}>
                {customDraft
                  ? customDraft.asset.name
                  : 'Upload custom Excel template'}
              </Text>
              <Text style={s.uploadSub}>
                Choose a template, map the fields you want, then save the profile if you like.
              </Text>
            </View>
          </TouchableOpacity>

          {customDraft && (
            <>
              <Text style={[s.fieldTitle, { marginTop: 14 }]}>
                Template name
              </Text>
              <View style={s.profileNameRow}>
                <TextInput
                  style={s.profileNameInput}
                  value={customDraft.profileName || ''}
                  onChangeText={v => setCustomDraft(prev => ({ ...prev, profileName: v }))}
                  placeholder="Enter a name for this template"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="done"
                />
                <SecondaryButton
                  title="💾 Save"
                  onPress={handleSaveProfile}
                  style={{ flex: 0.32 }}
                />
              </View>
              <Text style={s.helper}>
                Give your template a name and tap Save to reuse it anytime.
              </Text>

              {customDraft.headers.map((header) => {
                const mapped = customDraft.mapping[header] || 'skip';
                return (
                  <View key={header} style={s.mapRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.mapHeader}>{header}</Text>
                    </View>
                    <TouchableOpacity
                      style={s.mapSelectBtn}
                      onPress={() => openMappingPicker(header)}
                    >
                      <Text style={s.mapSelectBtnText} numberOfLines={1}>
                        {getMappingLabel(mapped)} ▾
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </Card>

        <SectionLabel>Queue Preview</SectionLabel>
        {normalizedPreview.length === 0 ? (
          <Text style={s.empty}>
            Queue is empty. You need leads before exports become anything except decorative buttons.
          </Text>
        ) : (
          normalizedPreview.slice(0, 8).map((lead, index) => (
            <View key={lead.id || index} style={s.queueRow}>
              <Text style={s.rowNum}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.rowBiz}>
                  {lead.businessName || 'Unnamed Business'}
                </Text>
                <Text style={s.rowContact}>
                  {[lead.pocFirst, lead.pocLast].filter(Boolean).join(' ')} ·{' '}
                  {lead.city || 'Unknown city'}
                  {lead.state ? `, ${lead.state}` : ''}
                </Text>
              </View>
              <StatusBadge status={lead.status} />
            </View>
          ))
        )}

        <PrimaryButton
          title={exporting ? 'Exporting…' : 'Build Export File'}
          onPress={handleExport}
          disabled={
            exporting ||
            !prospects.length ||
            (selectedMode === 'saved' && !selectedProfile) ||
            (selectedMode === 'custom' && !customDraft)
          }
          style={{ marginTop: 20 }}
        />

        <SecondaryButton
          title="Send Backend Email"
          onPress={handleSendBackendEmail}
          disabled={
            exporting ||
            !prospects.length ||
            (selectedMode === 'saved' && !selectedProfile) ||
            (selectedMode === 'custom' && !customDraft)
          }
          style={{ marginTop: 10 }}
        />

        <View style={s.exportOptionRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.exportOptionTitle}>Clear queue after successful export</Text>
            <Text style={s.exportOptionSubtitle}>
              Ask before removing exported leads from the queue.
            </Text>
          </View>
          <Switch
            value={clearQueueAfterExport}
            onValueChange={setClearQueueAfterExport}
            trackColor={{ false: 'rgba(255,255,255,0.08)', true: COLORS.accent }}
            thumbColor={clearQueueAfterExport ? COLORS.accent : '#f4f3f4'}
          />
        </View>

        {!!statusText && <Text style={s.statusText}>{statusText}</Text>}
        {exporting && (
          <ActivityIndicator
            size="large"
            color={COLORS.accent}
            style={{ marginTop: 14 }}
          />
        )}

        <Modal
          visible={mappingPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setMappingPickerOpen(false);
            setActiveTemplateColumn(null);
          }}
        >
          <View style={s.mappingModalBackdrop}>
            <View style={s.mappingModalCard}>
              <Text style={s.mappingModalTitle}>
                Map "{activeTemplateColumn}" to:
              </Text>

              <ScrollView style={s.mappingModalList}>
                {CUSTOM_TEMPLATE_FIELD_OPTIONS.map((option) => (
                  <Pressable
                    key={option.label}
                    style={s.mappingModalOption}
                    onPress={() => selectMapping(option.key)}
                  >
                    <Text style={s.mappingModalOptionText}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                style={s.mappingModalCancel}
                onPress={() => {
                  setMappingPickerOpen(false);
                  setActiveTemplateColumn(null);
                }}
              >
                <Text style={s.mappingModalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={customFixedValueOpen}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setCustomFixedValueOpen(false);
            setActiveTemplateColumn(null);
          }}
        >
          <View style={s.mappingModalBackdrop}>
            <View style={s.mappingModalCard}>
              <Text style={s.mappingModalTitle}>
                Fixed value for "{activeTemplateColumn}"
              </Text>
              <TextInput
                style={s.mappingFixedInput}
                value={customFixedValueText}
                onChangeText={setCustomFixedValueText}
                placeholder="Enter a fixed value"
                placeholderTextColor="#7a8a9b"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveCustomFixedValue}
              />
              <View style={s.mappingFixedActions}>
                <Pressable
                  style={[s.mappingModalCancel, { flex: 1, marginRight: 8 }]}
                  onPress={() => {
                    setCustomFixedValueOpen(false);
                    setCustomFixedValueText('');
                    setActiveTemplateColumn(null);
                  }}
                >
                  <Text style={s.mappingModalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.mappingModalOption, { flex: 1, alignItems: 'center', marginLeft: 0, borderBottomWidth: 0, paddingVertical: 14 }]}
                  onPress={saveCustomFixedValue}
                >
                  <Text style={s.mappingModalOptionText}>Save</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModeCard({ title, subtitle, active, onPress }) {
  return (
    <TouchableOpacity
      style={[s.modeCard, active && s.modeCardActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[s.modeTitle, active && s.modeTitleActive]}>
        {title}
      </Text>
      <Text style={s.modeSub}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  summaryCard: { marginTop: 16, alignItems: 'center' },
  bigCount: { fontSize: 52, fontWeight: '900', color: COLORS.accent },
  bigCountLabel: { color: COLORS.textDim, fontSize: 13 },
  empInfo: { color: COLORS.muted, fontSize: 12, marginTop: 6 },
  modeGrid: { gap: 10 },
  modeCard: {
    backgroundColor: COLORS.surface, borderWidth: 1,
    borderColor: COLORS.borderLit, borderRadius: 14, padding: 14,
    position: 'relative', overflow: 'hidden',
  },
  modeCardActive: {
    borderColor: 'rgba(0,201,255,0.4)',
    backgroundColor: 'rgba(0,201,255,0.06)',
  },
  modeTitle: { color: COLORS.textDim, fontWeight: '700', fontSize: 15 },
  modeTitleActive: { color: COLORS.accent },
  modeSub: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  pickerWrap: {
    backgroundColor: COLORS.surface2, borderWidth: 1,
    borderColor: COLORS.borderLit, borderRadius: 10, overflow: 'hidden',
  },
  picker: { color: COLORS.text, height: 48 },
  uploadBtn: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  uploadIcon: { fontSize: 24 },
  uploadLabel: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  uploadSub: { color: COLORS.textDim, fontSize: 12, marginTop: 4, lineHeight: 17 },
  fieldTitle: {
    color: COLORS.label, fontSize: 10, textTransform: 'uppercase',
    letterSpacing: 1.5, fontWeight: '700', marginBottom: 8,
  },
  helper: { color: COLORS.textDim, fontSize: 12, lineHeight: 18, marginTop: 8 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileNameInput: {
    flex: 1, backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    color: COLORS.text, fontSize: 14,
  },
  profileRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  profileRowActive: {
    borderColor: 'rgba(0,201,255,0.4)',
    backgroundColor: 'rgba(0,201,255,0.06)',
  },
  profileRowName: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  profileRowNameActive: { color: COLORS.accent },
  profileRowSub: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  profileRowCheck: { color: COLORS.accent, fontWeight: '900', fontSize: 16, marginRight: 4 },
  mapRow: {
    paddingTop: 12, paddingBottom: 4,
    borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 12,
  },
  mapHeader: { color: COLORS.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  mapPickerWrap: {
    backgroundColor: COLORS.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.borderLit, overflow: 'hidden',
  },
  mapPicker: { color: COLORS.text, height: 48 },
  mapSelectBtn: {
    flex: 0.55, backgroundColor: COLORS.surface2,
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.accent,
    paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center',
  },
  mapSelectBtnText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 16, fontSize: 13, lineHeight: 20 },
  queueRow: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 14, flexDirection: 'row',
    gap: 10, alignItems: 'center', marginBottom: 8,
  },
  rowNum: { width: 24, color: COLORS.purple, fontWeight: '700', fontSize: 14 },
  rowBiz: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  rowContact: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  statusText: { textAlign: 'center', marginTop: 12, color: COLORS.muted, fontSize: 13 },
  mappingModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  mappingModalCard: {
    width: '100%', maxHeight: '80%',
    backgroundColor: COLORS.surface, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(0,201,255,0.3)', padding: 18,
  },
  mappingModalTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: 14 },
  mappingModalList: { maxHeight: 420 },
  mappingModalOption: {
    paddingVertical: 14, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  mappingModalOptionText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  mappingModalCancel: {
    marginTop: 14, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', backgroundColor: COLORS.surface2,
  },
  mappingModalCancelText: { color: COLORS.textDim, fontSize: 15, fontWeight: '700' },
  mappingFixedInput: {
    backgroundColor: COLORS.surface2, borderColor: COLORS.borderLit,
    borderWidth: 1, borderRadius: 10, color: COLORS.text,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 10,
  },
  mappingFixedActions: { flexDirection: 'row', marginTop: 14 },
  exportOptionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderRadius: 14, backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: 'rgba(0,201,255,0.22)',
    marginTop: 12, marginBottom: 12,
  },
  exportOptionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  exportOptionSubtitle: { color: COLORS.textDim, fontSize: 12, marginTop: 3 },
});