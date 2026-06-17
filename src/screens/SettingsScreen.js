import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Alert,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { Picker } from '@react-native-picker/picker';
import {
  AUTO_EXPORT_SETTINGS_KEY,
  AUTO_INTRO_KEY,
  AUTOMATION_SETTINGS_KEY,
  COLORS,
  DEFAULT_INTRO_TEMPLATES,
  DEFAULT_REVIEW_TEMPLATES,
  EXPORT_MODES,
  LEADS_STORAGE_KEY,
  SUPABASE_SETTINGS_KEY,
  USER_STORAGE_KEY,
  APP_VERSION,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from '../constants';
import {
  ScreenHeader,
  FieldInput,
  PrimaryButton,
  Card,
  SectionLabel,
} from '../components/UI';
import {
  getExportSettings,
  getIntroTemplates,
  getReviewTemplates,
  resetIntroTemplates,
  resetReviewTemplates,
  saveExportSettings,
  saveIntroTemplates,
  saveReviewTemplates,
} from '../utils/templateSettings';
import { loadExportProfiles } from '../utils/exportProfiles';
import { maybeRunAutoExport } from '../utils/autoExport';
import { createSupabaseClient } from '../utils/supabaseClient';
import { unregisterPushToken } from '../utils/pushNotifications';
import {
  getSoundsEnabled,
  setSoundsEnabled,
  loadSoundSettings,
  getDailyGoalChimeEnabled,
  setDailyGoalChimeEnabled,
  loadDailyGoalChimeSettings,
  loadExportSoundSettings,
  setExportSoundsEnabled,
} from '../utils/soundManager';
import {
  isAIWelcomeEnabled,
  setAIWelcomeEnabled,
  loadAIRecommendationSettings,
  setAIRecommendationPreference,
  getAIPersonalityStyle,
  setAIPersonalityStyle,
  getAIVoiceProfile,
  setAIVoiceProfile,
} from '../utils/aiWelcome';
import { supabase } from '../lib/supabase';
import { AI_PERSONALITY_STYLES, AI_VOICE_PROFILES, GOALS_STORAGE_KEY } from '../constants';
import { getPreviewLine } from '../utils/aiPersonality';
import { resetAllTutorials } from '../utils/tutorialManager';
import {
  queueScheduledExport,
  syncQueueToSupabase,
  verifyExportsBucket,
} from '../utils/backendSync';
import { sendBackendEmail } from '../utils/backendEmail';
import { resetUserLearningData, recordUserActivityEvent, upsertUserLearningProfile, loadUserLearningProfile } from '../utils/userLearning';
import { showThemedAlert, ThemedAlertHost } from '../components/ThemedAlert';
import TargetLensProfileSelector from '../components/TargetLensProfileSelector';
import BetaTracker from '../../utils/betaTracker';
import {
  OCR_IMAGE_OPTIMIZATION_ENABLED,
  SCAN_ENRICHMENT_QUEUE_ENABLED,
  SCAN_QUEUE_PROCESSING_ENABLED,
  SCAN_RECOVERY_ENABLED,
} from '../config/featureFlags';
import {
  openBatteryOptimizationSettings,
  WORKDAY_PERSIST_MS,
} from '../utils/backgroundStability';

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const SETTINGS_TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'experience', label: 'Experience' },
  { key: 'exports', label: 'Exports' },
  { key: 'backend', label: 'Backend' },
  { key: 'tools', label: 'Tools' },
  { key: 'info', label: 'App Info' },
];

const DEFAULT_AUTO_EXPORT = {
  enabled: false,
  time: '16:00',
  recipients: '',
  subject: 'LeadLens Scheduled Export ({count} prospects)',
  body: 'Attached is your scheduled LeadLens export containing {count} queued prospects.',
  exportMode: 'template', // legacy field, keeping for fallback
  exportFormat: 'universal_excel',
  templateId: null,
  templateName: null,
  reviewedOnly: false,
  excludeDuplicates: true,
  clearAfterSend: false,
  archiveAfterSend: false,
  days: [1, 2, 3, 4, 5],
  lastStatus: '',
  lastRunDate: '',
};

const DEFAULT_SUPABASE = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};

const DEFAULT_AUTOMATION = {
  enabled: false,
  sendTime: '16:00',
  recipients: '',
  subject: 'LeadLens Scheduled Export',
  body: 'Attached is the latest LeadLens export.',
  exportProfile: 'standard',
  clearAfterSend: false,
};

const BACKEND_EMAIL_SETTINGS_KEY = 'BACKEND_EMAIL_SETTINGS';

const DEFAULT_BACKEND_EMAIL = {
  enabled: true,
  endpoint: 'https://okayestmedia.netlify.app/.netlify/functions/send-email',
  recipient: '',
  subject: 'LeadLens Export',
  htmlBody: '<strong>Your LeadLens export is ready.</strong>',
};

const DEFAULT_LENSSIGNAL_PREFS = {
  notifications_enabled: true,
  proximity_miles: 5,
  notify_priority_review: true,
  notify_pest_indicator: true,
  notify_opening_signal: true,
  notify_opportunity: false,
  notify_monitor: false,
  work_hours_only: true,
  workday_start: '07:00',
  workday_end: '17:00',
};

function normalizeTimeString(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || '0', 10);
  const suffix = match[3] ? match[3].toLowerCase() : null;

  if (suffix) {
    if (hour === 12) {
      hour = suffix === 'am' ? 0 : 12;
    } else if (suffix === 'pm') {
      hour += 12;
    }
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function formatTimeDisplay(value) {
  const normalized = normalizeTimeString(value);
  if (!normalized) return String(value || '');
  const [hourStr, minuteStr] = normalized.split(':');
  const hour = Number(hourStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minuteStr} ${period}`;
}

async function handleTestBackendEmail(settings) {
  try {
    if (!settings?.endpoint || !settings?.recipient) {
      showThemedAlert(
        'Missing Backend Email Settings',
        'Please add a backend endpoint and recipient email first.'
      );
      return;
    }

    await sendBackendEmail({
      endpoint: settings.endpoint,
      to: settings.recipient,
      subject: settings.subject || 'LeadLens Test Email',
      html:
        settings.htmlBody ||
        '<strong>This is a LeadLens backend email test.</strong>',
      text: 'This is a LeadLens backend email test.',
    });

    showThemedAlert('Success', 'Backend email sent successfully.');
  } catch (error) {
    BetaTracker.crash('SettingsScreen', error);
    showThemedAlert('Backend Email Failed', error?.message || 'Unknown error');
  }
}

export default function SettingsScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('SettingsScreen');
    console.log("[Settings] Opening settings screen");
  }, []);

  const routeUser = route?.params?.user || {};
  const [activeTab, setActiveTab] = useState('profile');
  const [userProfile, setUserProfile] = useState(() => ({
    ...routeUser,
    repEmail: routeUser.repEmail || routeUser.email || '',
    phone: routeUser.phone || '',
    territory: routeUser.territory || '',
    authProvider: routeUser.authProvider || 'local',
  }));

  const user = userProfile;

  const [templates, setTemplates] = useState(DEFAULT_INTRO_TEMPLATES);
  const [reviewTemplates, setReviewTemplates] = useState(DEFAULT_REVIEW_TEMPLATES);
  const [autoIntro, setAutoIntro] = useState(true);
  const [defaultExportMode, setDefaultExportMode] = useState(EXPORT_MODES.STANDARD);
  const [defaultExportProfile, setDefaultExportProfile] = useState('');
  const [savedExportProfiles, setSavedExportProfiles] = useState([]);
  const [autoExport, setAutoExport] = useState(DEFAULT_AUTO_EXPORT);
  const [supabaseSettings, setSupabaseSettings] = useState(DEFAULT_SUPABASE);
  const [automation, setAutomation] = useState(DEFAULT_AUTOMATION);
  const [backendEmail, setBackendEmail] = useState(DEFAULT_BACKEND_EMAIL);
  const [queueCount, setQueueCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lockSupabase, setLockSupabase] = useState(true);
  const [lockBackend, setLockBackend] = useState(true);
  const [adminAuthVisible, setAdminAuthVisible] = useState(false);
  const [adminAuthTarget, setAdminAuthTarget] = useState(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');

  const handleAdminUnlock = () => {
    if (adminPasswordInput === 'JJ.0324!!!!') {
      if (adminAuthTarget === 'supabase') setLockSupabase(false);
      if (adminAuthTarget === 'backend') setLockBackend(false);
      setAdminAuthVisible(false);
      setAdminPasswordInput('');
    } else {
      showThemedAlert('Access Denied', 'Incorrect admin password.');
    }
  };

  const openAdminAuth = (target) => {
    setAdminAuthTarget(target);
    setAdminAuthVisible(true);
  };
  const [soundsEnabled, setSoundsEnabledState] = useState(true);
  const [dailyGoalChimeEnabled, setDailyGoalChimeEnabledState] = useState(true);
  const [exportSoundsEnabled, setExportSoundsEnabledState] = useState(true);
  const [aiWelcomeEnabled, setAiWelcomeEnabledState] = useState(true);
  const [personalityStyle, setPersonalityStyleState] = useState(AI_PERSONALITY_STYLES.FRIENDLY_COACH);
  const [voiceProfile, setVoiceProfileState] = useState(Object.values(AI_VOICE_PROFILES)[0]);
  const [personalizedRecommendations, setPersonalizedRecommendations] = useState(true);
  const [useLocationHistory, setUseLocationHistory] = useState(true);
  const [userGoals, setUserGoals] = useState({ dailyProspects: '' });
  const [lensSignalPrefs, setLensSignalPrefs] = useState(DEFAULT_LENSSIGNAL_PREFS);

  useEffect(() => {
    loadSoundSettings().then((enabled) => setSoundsEnabledState(enabled));
    loadDailyGoalChimeSettings().then((enabled) => setDailyGoalChimeEnabledState(enabled));
    loadExportSoundSettings().then((enabled) => setExportSoundsEnabledState(enabled));
    isAIWelcomeEnabled().then((enabled) => setAiWelcomeEnabledState(enabled));
    loadAIRecommendationSettings().then((settings) => {
      setPersonalizedRecommendations(settings.personalizedRecommendations);
      setUseLocationHistory(settings.useLocationHistory);
      setPersonalityStyleState(settings.personalityStyle);
      setVoiceProfileState(settings.voiceProfile);
    }).catch(() => {});
    AsyncStorage.getItem(GOALS_STORAGE_KEY).then((raw) => {
      if (raw) setUserGoals(JSON.parse(raw));
    });

    if (routeUser?.id) {
      console.log("[Settings] Loading remote preferences for:", routeUser.id);
      supabase
        .from('lenssignal_user_preferences')
        .select('*')
        .eq('user_id', routeUser.id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.warn("[Settings] Error loading remote preferences:", error.message);
          }
          if (data) {
            console.log("[Settings] Remote preferences loaded successfully");
            setLensSignalPrefs({ ...DEFAULT_LENSSIGNAL_PREFS, ...data });
          }
        })
        .catch((err) => {
          console.error("[Settings] Critical error loading remote preferences:", err);
        });
    }
  }, [routeUser?.id]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const results = await Promise.all([
        getIntroTemplates().catch(() => DEFAULT_INTRO_TEMPLATES),
        getReviewTemplates().catch(() => DEFAULT_REVIEW_TEMPLATES),
        getExportSettings().catch(() => ({})),
        loadExportProfiles().catch(() => []),
        AsyncStorage.getItem(AUTO_INTRO_KEY).catch(() => null),
        AsyncStorage.getItem(AUTO_EXPORT_SETTINGS_KEY).catch(() => null),
        AsyncStorage.getItem(SUPABASE_SETTINGS_KEY).catch(() => null),
        AsyncStorage.getItem(AUTOMATION_SETTINGS_KEY).catch(() => null),
        AsyncStorage.getItem(LEADS_STORAGE_KEY).catch(() => null),
        AsyncStorage.getItem(BACKEND_EMAIL_SETTINGS_KEY).catch(() => null),
        AsyncStorage.getItem(USER_STORAGE_KEY).catch(() => null),
      ]);

      const [
        savedTemplates,
        savedReviewTemplates,
        exportSettings,
        savedProfiles,
        storedAutoIntro,
        rawAutoExport,
        rawSupabase,
        rawAutomation,
        rawQueue,
        rawBackendEmail,
        rawUser,
      ] = results;

      if (!mounted) return;

      if (rawUser) {
        try {
          const parsedUser = JSON.parse(rawUser);
          if (parsedUser && typeof parsedUser === 'object') {
            console.log("[Settings] Loading local user profile from storage");
            setUserProfile((prev) => ({
              ...prev,
              ...parsedUser,
              repEmail: parsedUser.repEmail || parsedUser.email || prev.repEmail || '',
              phone: parsedUser.phone || prev.phone || '',
            }));
          }
        } catch (e) {
    BetaTracker.crash('SettingsScreen', e);
          console.error("[Settings] Failed to parse local user profile:", e);
        }
      }

      setTemplates(savedTemplates);
      setReviewTemplates(savedReviewTemplates);
      setSavedExportProfiles(savedProfiles || []);
      let initialMode = exportSettings.mode || EXPORT_MODES.STANDARD;
      if (initialMode === EXPORT_MODES.SALES_TEMPLATE) {
        initialMode = EXPORT_MODES.STANDARD;
      }
      setDefaultExportMode(initialMode);
      setDefaultExportProfile(exportSettings.profileName || '');

      if (storedAutoIntro !== null) {
        setAutoIntro(storedAutoIntro === 'true');
      }

      if (rawAutoExport) {
        try {
          const parsed = { ...DEFAULT_AUTO_EXPORT, ...JSON.parse(rawAutoExport) };
          setAutoExport({
            ...parsed,
            time: formatTimeDisplay(parsed.time || DEFAULT_AUTO_EXPORT.time),
          });
        } catch {
          setAutoExport({
            ...DEFAULT_AUTO_EXPORT,
            time: formatTimeDisplay(DEFAULT_AUTO_EXPORT.time),
          });
        }
      }

      if (rawSupabase) {
        try {
          setSupabaseSettings({
            ...DEFAULT_SUPABASE,
            ...JSON.parse(rawSupabase),
          });
        } catch {}
      }

      if (rawAutomation) {
        try {
          const parsed = { ...DEFAULT_AUTOMATION, ...JSON.parse(rawAutomation) };
          setAutomation({
            ...parsed,
            sendTime: formatTimeDisplay(parsed.sendTime || DEFAULT_AUTOMATION.sendTime),
          });
        } catch {
          setAutomation({
            ...DEFAULT_AUTOMATION,
            sendTime: formatTimeDisplay(DEFAULT_AUTOMATION.sendTime),
          });
        }
      }

      if (rawBackendEmail) {
        try {
          setBackendEmail({
            ...DEFAULT_BACKEND_EMAIL,
            ...JSON.parse(rawBackendEmail),
          });
        } catch {}
      }

      // If MMKV returned nothing, check raw AsyncStorage backup
      let finalRawQueue = rawQueue;
      if (!finalRawQueue) {
        try {
          const RawStorage = require('@react-native-async-storage/async-storage').default;
          finalRawQueue = await RawStorage.getItem(LEADS_STORAGE_KEY).catch(() => null);
        } catch {}
      }
      const parsedQueue = finalRawQueue ? JSON.parse(finalRawQueue) : [];
      setQueueCount(Array.isArray(parsedQueue) ? parsedQueue.length : 0);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const updateTemplate = (key, value) => setTemplates((prev) => ({ ...prev, [key]: value }));
  const updateReviewTemplate = (key, value) => setReviewTemplates((prev) => ({ ...prev, [key]: value }));
  const updateAutoExport = (key, value) => setAutoExport((prev) => ({ ...prev, [key]: value }));
  const updateSupabase = (key, value) => setSupabaseSettings((prev) => ({ ...prev, [key]: value }));
  const updateAutomation = (key, value) => setAutomation((prev) => ({ ...prev, [key]: value }));
  const updateBackendEmail = (key, value) => setBackendEmail((prev) => ({ ...prev, [key]: value }));
  const updateUserProfile = (key, value) => setUserProfile((prev) => ({ ...prev, [key]: value }));
  const updateLensSignalPref = (key, value) => setLensSignalPrefs((prev) => ({ ...prev, [key]: value }));

  const saveAll = async () => {
    try {
      setSaving(true);
      const normalizedAutoExportTime = normalizeTimeString(autoExport.time) || DEFAULT_AUTO_EXPORT.time;
      const normalizedAutomationTime = normalizeTimeString(automation.sendTime) || DEFAULT_AUTOMATION.sendTime;

      const exportSettingsPayload = {
        mode: defaultExportMode,
        profileName: defaultExportMode === EXPORT_MODES.CUSTOM ? defaultExportProfile : '',
      };

      const firstName = String(user.firstName || '').trim();
      const lastName = String(user.lastName || '').trim();
      const repName = String(user.repName || `${firstName} ${lastName}`).trim();
      console.log("[Settings] Saving profile for:", repName);
      const savedUser = {
        ...user,
        firstName,
        lastName,
        repName,
        repEmail: String(user.repEmail || '').trim(),
        phone: String(user.phone || '').trim(),
        territory: String(user.territory || '').trim(),
      };

      await Promise.all([
        saveIntroTemplates(templates),
        saveReviewTemplates(reviewTemplates),
        saveExportSettings(exportSettingsPayload),
        AsyncStorage.setItem(AUTO_INTRO_KEY, String(autoIntro)),
        AsyncStorage.setItem(
          AUTO_EXPORT_SETTINGS_KEY,
          JSON.stringify({ ...autoExport, time: normalizedAutoExportTime })
        ),
        AsyncStorage.setItem(SUPABASE_SETTINGS_KEY, JSON.stringify(supabaseSettings)),
        AsyncStorage.setItem(
          AUTOMATION_SETTINGS_KEY,
          JSON.stringify({ ...automation, sendTime: normalizedAutomationTime })
        ),
        AsyncStorage.setItem(BACKEND_EMAIL_SETTINGS_KEY, JSON.stringify(backendEmail)),
        AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(userGoals)),
        AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(savedUser)),
      ]);

      if (user.id) {
        console.log("[Settings] Upserting remote preferences to Supabase");
        const { error: upsertError } = await supabase.from('lenssignal_user_preferences').upsert({
          user_id: user.id,
          ...lensSignalPrefs,
          updated_at: new Date().toISOString(),
        });
        if (upsertError) {
          console.warn("[Settings] Supabase upsert failed:", upsertError.message);
        }
      }

      setUserProfile(savedUser);
      navigation.setParams?.({ user: savedUser });
      setAutoExport((prev) => ({
        ...prev,
        time: formatTimeDisplay(normalizedAutoExportTime),
      }));
      setAutomation((prev) => ({
        ...prev,
        sendTime: formatTimeDisplay(normalizedAutomationTime),
      }));

      showThemedAlert('Saved', 'Your settings and profile were saved.');
    } catch (err) {
    BetaTracker.crash('SettingsScreen', err);
      console.error("[Settings] Save failed:", err);
      showThemedAlert('Save Error', err?.message || 'Unknown error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetTemplates = () => {
    showThemedAlert(
      'Reset templates',
      'Restore the default email and text templates?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const restored = await resetIntroTemplates();
            setTemplates(restored);
          },
        },
      ]
    );
  };

  const handleResetReviewTemplates = () => {
    showThemedAlert(
      'Reset review templates',
      'Restore the default free review offer templates?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const restored = await resetReviewTemplates();
            setReviewTemplates(restored);
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    showThemedAlert('Sign Out', 'Clear your saved session and return to login?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(USER_STORAGE_KEY);
          try {
            const supabase = createSupabaseClient(supabaseSettings);
            if (supabase) {
              const { data: { user: authUser } } = await supabase.auth.getUser();
              if (authUser?.id) await unregisterPushToken(authUser.id);
            }
          } catch {}
          // Push all data before logout
await syncAllDataToSupabase(user, supabaseSettings).catch(() => {});
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  const toggleDay = (day) => {
    const current = new Set(autoExport.days || []);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    updateAutoExport('days', Array.from(current).sort((a, b) => a - b));
  };

  const runAutoExportNow = async () => {
    const mergedSettings = {
      ...autoExport,
      enabled: true,
      recipients: autoExport.recipients || automation.recipients || '',
      subject:
        autoExport.subject ||
        automation.subject ||
        'LeadLens Scheduled Export ({count} prospects)',
      body:
        autoExport.body ||
        automation.body ||
        'Attached is your scheduled LeadLens export containing {count} queued prospects.',
      lastRunDate: '',
    };

    await AsyncStorage.setItem(AUTO_EXPORT_SETTINGS_KEY, JSON.stringify(mergedSettings));

    const result = await maybeRunAutoExport(user, {
      force: true,
      settingsOverride: mergedSettings,
    });

    if (result.sent) {
      if (result.usedComposer) {
        showThemedAlert(
          'Auto export check',
          `Prepared ${result.count} prospect(s) for email${
            result.recipientsCount ? ` to ${result.recipientsCount} saved recipient(s)` : ''
          }.`
        );
      } else {
        showThemedAlert(
          'Auto export check',
          `Generated ${result.count} prospect(s) and opened the share sheet because no dedicated mail composer was available.`
        );
      }
      return;
    }

    showThemedAlert('Auto export check', result.reason || 'Nothing to send right now.');
  };

  const handleTestConnection = async () => {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) {
      showThemedAlert('Missing config', 'Enter your Supabase URL and anon key first.');
      return;
    }
    const { error } = await supabase.from('queue_items').select('id').limit(1);
    if (error) showThemedAlert('Connection failed', error.message);
    else showThemedAlert('Connected ✓', 'Supabase responded successfully.');
  };

  const handleVerifyBucket = async () => {
    const res = await verifyExportsBucket(supabaseSettings);
    if (res.ok) {
      showThemedAlert('Bucket found ✓', res.note || 'The "exports" bucket exists and is accessible.');
    } else {
      showThemedAlert('Bucket issue', res.hint || res.reason || 'Could not verify bucket.');
    }
  };

  const handleSyncNow = async () => {
    const res = await syncQueueToSupabase(user, supabaseSettings);
    if (!res.ok) {
      const msg = res.hint ? `${res.reason}\n\n${res.hint}` : res.reason || 'Unknown issue';
      showThemedAlert('Sync failed', msg);
    } else {
      showThemedAlert(
        'Sync complete ✓',
        res.reason === 'empty-queue' ? 'Queue is empty.' : `${res.count || 0} prospect(s) pushed to Supabase.`
      );
    }
  };

  const handleQueueJob = async () => {
    const res = await queueScheduledExport(user, supabaseSettings);
    if (!res.ok) showThemedAlert('Queue job failed', res.reason || 'Unknown issue');
    else {
      showThemedAlert(
        'Queued',
        res.reason === 'empty-queue'
          ? 'No prospects are in queue right now.'
          : 'A scheduled export job was queued in Supabase.'
      );
    }
  };

  const handleClearQueue = () => {
    if (!queueCount) {
      showThemedAlert('Queue is already empty');
      return;
    }

    showThemedAlert(
      'Clear queue',
      `Remove all ${queueCount} prospect(s) from the queue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            // Clear from MMKV (sync wrapper)
            AsyncStorage.removeSync(LEADS_STORAGE_KEY);
            // Also clear raw AsyncStorage backup written by BatchReviewScreen
            const RawStorage = require('@react-native-async-storage/async-storage').default;
            await RawStorage.removeItem(LEADS_STORAGE_KEY).catch(() => {});
            setQueueCount(0);
            showThemedAlert('Queue cleared');
          },
        },
      ]
    );
  };

  const handleOpenBatteryStabilitySettings = async () => {
    if (Platform.OS !== 'android') {
      showThemedAlert('iOS Notice', 'iOS background behavior is system-managed. Keep Background App Refresh enabled for best results.');
      return;
    }

    const opened = await openBatteryOptimizationSettings();
    if (!opened) {
      showThemedAlert('Could Not Open Battery Settings', 'Please open Android Settings manually and disable battery optimization for LeadLens.');
    }
  };

  const renderProfileTab = () => (
    <>
      <SectionLabel>User Profile</SectionLabel>
      <Card>
        <Text style={s.profileName}>{user.repName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'LeadLens User'}</Text>
        <Text style={s.profileSub}>
          {user.role || 'Role not set'} · Branch/Dept/Team {user.branchNum || '—'} · EMP {user.employeeNum || '—'}
        </Text>

        <View style={s.profileGrid}>
          <View style={s.profileCol}>
            <FieldInput
              label="First Name"
              value={String(user.firstName || '')}
              onChangeText={(v) => updateUserProfile('firstName', v)}
              placeholder="First name"
            />
          </View>
          <View style={s.profileCol}>
            <FieldInput
              label="Last Name"
              value={String(user.lastName || '')}
              onChangeText={(v) => updateUserProfile('lastName', v)}
              placeholder="Last name"
            />
          </View>
        </View>

        <FieldInput
          label="Email"
          value={String(user.repEmail || '')}
          onChangeText={(v) => updateUserProfile('repEmail', v)}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Phone"
            value={String(user.phone || '')}
            onChangeText={(v) => updateUserProfile('phone', v)}
            keyboardType="phone-pad"
            placeholder="(555) 555-5555"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Employee # (Optional)"
            value={String(user.employeeNum || '')}
            onChangeText={(v) => updateUserProfile('employeeNum', v)}
            placeholder="e.g. 6992986"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Branch / Dept / Team"
            value={String(user.branchNum || '')}
            onChangeText={(v) => updateUserProfile('branchNum', v)}
            placeholder="e.g. 686 or Sales"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Territory"
            value={String(user.territory || '')}
            onChangeText={(v) => updateUserProfile('territory', v)}
            placeholder="Primary territory"
          />
        </View>

        <View style={s.infoRowWrap}>
          <View style={s.infoPill}>
            <Text style={s.infoPillLabel}>Auth</Text>
            <Text style={s.infoPillValue}>{String(user.authProvider || 'local')}</Text>
          </View>
          <View style={s.infoPill}>
            <Text style={s.infoPillLabel}>Branch/Dept/Team</Text>
            <Text style={s.infoPillValue}>{String(user.branchNum || '—')}</Text>
          </View>
          <View style={s.infoPill}>
            <Text style={s.infoPillLabel}>Employee</Text>
            <Text style={s.infoPillValue}>{String(user.employeeNum || '—')}</Text>
          </View>
        </View>
      </Card>

      <SectionLabel>Session</SectionLabel>
      <Card>
        <Text style={s.goalNote}>
          Quick access to account actions without having to scroll through every other settings section.
        </Text>
        <TouchableOpacity style={s.resetTutorialsBtn} onPress={() => {
          resetAllTutorials();
          Alert.alert('Tutorials Reset', 'All tutorials will show again next time you visit each section.');
        }}>
          <Text style={s.resetTutorialsText}>↺ Reset All Tutorials</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </Card>
    </>
  );

  const renderExperienceTab = () => (
    <>
      <SectionLabel>TargetLens™ Focus</SectionLabel>
      <Card>
        <TargetLensProfileSelector />
      </Card>

      <SectionLabel>Expectations & Goals</SectionLabel>
      <Card>
        <Text style={s.goalNote}>
          Set your personal daily prospecting goal. This number drives the heat map thresholds on your territory map — your territory colors and pulse will reflect how your actual activity compares to your goal.
        </Text>
        <FieldInput
          label="Daily Prospects Goal"
          value={String(userGoals.dailyProspects || '')}
          onChangeText={(v) => setUserGoals((prev) => ({ ...prev, dailyProspects: v.replace(/[^0-9]/g, '') }))}
          keyboardType="numeric"
          placeholder="e.g. 10"
        />
        <Text style={s.goalHint}>
          Based on your entry, heat map levels will be:{'\n'}
          🟢 On Target — at or above goal{'\n'}
          🔵 Close — 70–99% of goal{'\n'}
          🟡 Below Target — 40–69% of goal{'\n'}
          🟠 Low Activity — 10–39% of goal{'\n'}
          ⚫ Inactive — under 10% of goal
        </Text>
      </Card>

      <SectionLabel>Outreach</SectionLabel>
      <Card>
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Auto Intro Prompt</Text>
            <Text style={s.toggleSub}>Show the outreach prompt automatically after saving a lead.</Text>
          </View>
          <TouchableOpacity style={[s.toggle, autoIntro && s.toggleOn]} onPress={() => setAutoIntro((prev) => !prev)}>
            <View style={[s.toggleThumb, autoIntro && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 16 }}>
          <FieldInput
            label="Email Subject"
            value={templates.emailSubject}
            onChangeText={(value) => updateTemplate('emailSubject', value)}
            placeholder="Introduction from {repName}"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Email Body"
            value={templates.emailBody}
            onChangeText={(value) => updateTemplate('emailBody', value)}
            placeholder="Hi {contactName}..."
            multiline
            numberOfLines={8}
            style={s.multiInput}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Text Message Body"
            value={templates.smsBody}
            onChangeText={(value) => updateTemplate('smsBody', value)}
            placeholder="Hi {firstName}..."
            multiline
            numberOfLines={5}
            style={s.multiInput}
          />
        </View>

        <Text style={s.tokenHelp}>
          Tokens: {'{repName}'}, {'{businessName}'}, {'{firstName}'}, {'{lastName}'}, {'{contactName}'}, {'{branchNum}'}, {'{city}'}, {'{state}'}
        </Text>

        <TouchableOpacity style={s.resetBtn} onPress={handleResetTemplates}>
          <Text style={s.resetText}>Reset templates to default</Text>
        </TouchableOpacity>
      </Card>

      <SectionLabel>Free Review Offer Templates</SectionLabel>
      <Card>
        <View style={{ marginTop: 4 }}>
          <FieldInput
            label="Review Email Subject"
            value={reviewTemplates.emailSubject}
            onChangeText={(value) => updateReviewTemplate('emailSubject', value)}
            placeholder="Free Pest Control Program Review for {businessName}"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Review Email Body"
            value={reviewTemplates.emailBody}
            onChangeText={(value) => updateReviewTemplate('emailBody', value)}
            placeholder="Hi {contactName}..."
            multiline
            numberOfLines={8}
            style={s.multiInput}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Review SMS Body"
            value={reviewTemplates.smsBody}
            onChangeText={(value) => updateReviewTemplate('smsBody', value)}
            placeholder="Hi {firstName}..."
            multiline
            numberOfLines={5}
            style={s.multiInput}
          />
        </View>

        <Text style={s.tokenHelp}>
          Tokens: {'{repName}'}, {'{businessName}'}, {'{firstName}'}, {'{lastName}'}, {'{contactName}'}, {'{branchNum}'}, {'{city}'}, {'{state}'}, {'{repEmail}'}
        </Text>

        <TouchableOpacity style={s.resetBtn} onPress={handleResetReviewTemplates}>
          <Text style={s.resetText}>Reset review templates to default</Text>
        </TouchableOpacity>
      </Card>

      <SectionLabel>App Sounds & Intelligence</SectionLabel>
      <Card>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Sound Effects</Text>
            <Text style={s.switchSub}>Plays audio cues for lead saves, captures, and alerts.</Text>
          </View>
          <TouchableOpacity style={[s.toggle, soundsEnabled && s.toggleOn]} onPress={async () => {
            const next = !soundsEnabled;
            setSoundsEnabledState(next);
            await setSoundsEnabled(next);
          }}>
            <View style={[s.toggleThumb, soundsEnabled && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Daily Goal Chime</Text>
            <Text style={s.switchSub}>Plays one chime when your daily prospect goal is reached.</Text>
          </View>
          <TouchableOpacity style={[s.toggle, dailyGoalChimeEnabled && s.toggleOn]} onPress={async () => {
            const next = !dailyGoalChimeEnabled;
            setDailyGoalChimeEnabledState(next);
            await setDailyGoalChimeEnabled(next);
          }}>
            <View style={[s.toggleThumb, dailyGoalChimeEnabled && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>AI Welcome Card</Text>
            <Text style={s.switchSub}>Show today’s smart briefing when you open the dashboard.</Text>
          </View>
          <TouchableOpacity style={[s.toggle, aiWelcomeEnabled && s.toggleOn]} onPress={async () => {
            const next = !aiWelcomeEnabled;
            setAiWelcomeEnabledState(next);
            await setAIWelcomeEnabled(next);
          }}>
            <View style={[s.toggleThumb, aiWelcomeEnabled && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={s.modeLabel}>AI Personality Style</Text>
          <View style={s.pickerWrap}>
            <Picker
              selectedValue={personalityStyle}
              onValueChange={async (itemValue) => {
                setPersonalityStyleState(itemValue);
                await setAIPersonalityStyle(itemValue);
                const profile = await loadUserLearningProfile();
                await upsertUserLearningProfile({ ...profile, ai_personality_style: itemValue });
              }}
              style={s.picker}
              dropdownIconColor={COLORS.accent}
            >
              {Object.entries(AI_PERSONALITY_STYLES).map(([key, label]) => (
                <Picker.Item key={key} label={label} value={label} />
              ))}
            </Picker>
          </View>
          <View style={s.previewBox}>
            <Text style={s.previewLabel}>Style Preview:</Text>
            <Text style={s.previewText}>{getPreviewLine(personalityStyle)}</Text>
            <TouchableOpacity
              style={s.previewBtn}
              onPress={() => Alert.alert('Style Preview', getPreviewLine(personalityStyle))}
            >
              <Text style={s.previewBtnText}>Test Style Voice 🔊</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ marginTop: 20 }}>
          <Text style={s.modeLabel}>AI Voice Profile</Text>
          <View style={s.pickerWrap}>
            <Picker
              selectedValue={voiceProfile}
              onValueChange={async (itemValue) => {
                setVoiceProfileState(itemValue);
                await setAIVoiceProfile(itemValue);
                const profile = await loadUserLearningProfile();
                await upsertUserLearningProfile({ ...profile, ai_voice_profile: itemValue });
              }}
              style={s.picker}
              dropdownIconColor={COLORS.accent}
            >
              {Object.entries(AI_VOICE_PROFILES).map(([key, label]) => (
                <Picker.Item key={key} label={label} value={label} />
              ))}
            </Picker>
          </View>
          <Text style={s.help}>Voice selection controls how the AI sounds, while personality style controls the wording and tone.</Text>
        </View>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Personalized Recommendations</Text>
            <Text style={s.switchSub}>Use your past activity and preferences to customize area scoring.</Text>
          </View>
          <TouchableOpacity style={[s.toggle, personalizedRecommendations && s.toggleOn]} onPress={async () => {
            const next = !personalizedRecommendations;
            setPersonalizedRecommendations(next);
            await setAIRecommendationPreference('personalizedRecommendations', next);
          }}>
            <View style={[s.toggleThumb, personalizedRecommendations && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Use Location History</Text>
            <Text style={s.switchSub}>Include your recent LOCATION and ZIP activity when ranking areas.</Text>
          </View>
          <TouchableOpacity style={[s.toggle, useLocationHistory && s.toggleOn]} onPress={async () => {
            const next = !useLocationHistory;
            setUseLocationHistory(next);
            await setAIRecommendationPreference('useLocationHistory', next);
          }}>
            <View style={[s.toggleThumb, useLocationHistory && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.resetBtn} onPress={async () => {
          Alert.alert(
            'Reset Learning Data',
            'This will clear your personalized scoring and event history. Continue?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset',
                style: 'destructive',
                onPress: async () => {
                  await resetUserLearningData();
                  Alert.alert('Reset complete', 'Your personalization data has been cleared.');
                },
              },
            ]
          );
        }}>
          <Text style={s.resetText}>Reset Learning Data</Text>
        </TouchableOpacity>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Export Sounds</Text>
            <Text style={s.switchSub}>Plays audio cues for successful export creation and upload.</Text>
          </View>
          <TouchableOpacity style={[s.toggle, exportSoundsEnabled && s.toggleOn]} onPress={async () => {
            const next = !exportSoundsEnabled;
            setExportSoundsEnabledState(next);
            await setExportSoundsEnabled(next);
          }}>
            <View style={[s.toggleThumb, exportSoundsEnabled && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>
      </Card>

      <SectionLabel>LensSignal Intelligence</SectionLabel>
      <Card>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Enable LensSignal Notifications</Text>
            <Text style={s.switchSub}>Receive push alerts for high-priority compliance and opening signals near you.</Text>
          </View>
          <TouchableOpacity
            style={[s.toggle, (lensSignalPrefs?.notifications_enabled ?? true) && s.toggleOn]}
            onPress={() => updateLensSignalPref('notifications_enabled', !(lensSignalPrefs?.notifications_enabled ?? true))}
          >
            <View style={[s.toggleThumb, (lensSignalPrefs?.notifications_enabled ?? true) && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={s.modeLabel}>Proximity Alert Radius</Text>
          <View style={s.pickerWrap}>
            <Picker
              selectedValue={lensSignalPrefs?.proximity_miles ?? 5}
              onValueChange={(v) => updateLensSignalPref('proximity_miles', v)}
              style={s.picker}
              dropdownIconColor={COLORS.accent}
            >
              <Picker.Item label="1 mile" value={1} />
              <Picker.Item label="3 miles" value={3} />
              <Picker.Item label="5 miles" value={5} />
              <Picker.Item label="10 miles" value={10} />
            </Picker>
          </View>
        </View>

        <View style={[s.switchRow, { marginTop: 20 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Notify Priority Review</Text>
            <Text style={s.switchSub}>Alert when a nearby establishment is flagged for priority health review.</Text>
          </View>
          <Switch
            value={!!(lensSignalPrefs?.notify_priority_review ?? true)}
            onValueChange={(v) => updateLensSignalPref('notify_priority_review', v)}
            trackColor={{ true: COLORS.accent }}
          />
        </View>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Notify Pest Indicator</Text>
            <Text style={s.switchSub}>Alert when pest-related violations are detected in recent inspections.</Text>
          </View>
          <Switch
            value={!!(lensSignalPrefs?.notify_pest_indicator ?? true)}
            onValueChange={(v) => updateLensSignalPref('notify_pest_indicator', v)}
            trackColor={{ true: COLORS.accent }}
          />
        </View>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Notify Opening Signal</Text>
            <Text style={s.switchSub}>Alert for new business permits and upcoming openings.</Text>
          </View>
          <Switch
            value={!!(lensSignalPrefs?.notify_opening_signal ?? true)}
            onValueChange={(v) => updateLensSignalPref('notify_opening_signal', v)}
            trackColor={{ true: COLORS.accent }}
          />
        </View>

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Notify Opportunity</Text>
            <Text style={s.switchSub}>Alert for mid-tier compliance signals that may indicate a sales opportunity.</Text>
          </View>
          <Switch
            value={!!(lensSignalPrefs?.notify_opportunity ?? false)}
            onValueChange={(v) => updateLensSignalPref('notify_opportunity', v)}
            trackColor={{ true: COLORS.accent }}
          />
        </View>

        <View style={[s.switchRow, { marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Work-hours Only</Text>
            <Text style={s.switchSub}>Only receive notifications during your configured workday.</Text>
          </View>
          <TouchableOpacity
            style={[s.toggle, (lensSignalPrefs?.work_hours_only ?? true) && s.toggleOn]}
            onPress={() => updateLensSignalPref('work_hours_only', !(lensSignalPrefs?.work_hours_only ?? true))}
          >
            <View style={[s.toggleThumb, (lensSignalPrefs?.work_hours_only ?? true) && s.toggleThumbOn]} />
          </TouchableOpacity>
        </View>

        {(lensSignalPrefs?.work_hours_only ?? true) && (
          <View style={s.profileGrid}>
            <View style={s.profileCol}>
              <FieldInput
                label="Workday Start"
                value={String(lensSignalPrefs.workday_start || '07:00')}
                onChangeText={(v) => updateLensSignalPref('workday_start', v)}
                placeholder="07:00"
              />
            </View>
            <View style={s.profileCol}>
              <FieldInput
                label="Workday End"
                value={String(lensSignalPrefs.workday_end || '17:00')}
                onChangeText={(v) => updateLensSignalPref('workday_end', v)}
                placeholder="17:00"
              />
            </View>
          </View>
        )}
      </Card>
    </>
  );

  const renderExportsTab = () => (
    <>
      <SectionLabel>Export Defaults</SectionLabel>
      <Card>
        <Text style={s.modeLabel}>Default Export Mode</Text>

        <TouchableOpacity style={[s.modeBtn, defaultExportMode === EXPORT_MODES.STANDARD && s.modeBtnActive]} onPress={() => {
          setDefaultExportMode(EXPORT_MODES.STANDARD);
          setDefaultExportProfile('');
        }}>
          <Text style={[s.modeTitle, defaultExportMode === EXPORT_MODES.STANDARD && s.modeTitleActive]}>
            Standard Spreadsheet
          </Text>
          <Text style={s.modeSub}>Exports a general lead file without the sales template layout.</Text>
        </TouchableOpacity>

        <Text style={[s.modeLabel, { marginTop: 14 }]}>Saved Custom Templates</Text>
        {savedExportProfiles.length ? (
          savedExportProfiles.map((profile) => (
            <TouchableOpacity
              key={profile.name}
              style={[
                s.modeBtn,
                defaultExportMode === EXPORT_MODES.CUSTOM && defaultExportProfile === profile.name && s.modeBtnActive,
              ]}
              onPress={() => {
                setDefaultExportMode(EXPORT_MODES.CUSTOM);
                setDefaultExportProfile(profile.name);
              }}
            >
              <Text
                style={[
                  s.modeTitle,
                  defaultExportMode === EXPORT_MODES.CUSTOM && defaultExportProfile === profile.name && s.modeTitleActive,
                ]}
              >
                {profile.name}
              </Text>
              <Text style={s.modeSub}>
                {profile.headers?.length || 0} columns · {profile.templateUri ? 'Custom template' : 'Standard mapping'}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={s.help}>No saved custom export templates yet. Create profiles on the Export screen.</Text>
        )}
      </Card>

      <SectionLabel>Scheduled Auto Export</SectionLabel>
      <Card>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Enable scheduled export</Text>
            <Text style={s.switchSub}>Runs when the app is opened or resumed around the scheduled time.</Text>
          </View>
          <Switch value={autoExport.enabled} onValueChange={(v) => updateAutoExport('enabled', v)} trackColor={{ true: COLORS.accent }} />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Send Time (12h hh:mm AM/PM)"
            value={String(autoExport.time || '')}
            onChangeText={(v) => updateAutoExport('time', v)}
            placeholder="5:00 PM"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Recipients"
            value={String(autoExport.recipients || '')}
            onChangeText={(v) => updateAutoExport('recipients', v)}
            placeholder="you@company.com, team@company.com"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput label="Subject" value={String(autoExport.subject || '')} onChangeText={(v) => updateAutoExport('subject', v)} />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Body"
            value={String(autoExport.body || '')}
            onChangeText={(v) => updateAutoExport('body', v)}
            multiline
            numberOfLines={4}
            style={{ minHeight: 110 }}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={s.modeLabel}>Export Format (Default)</Text>
          <TouchableOpacity
            style={[s.modeBtn, (autoExport.exportFormat === 'universal_excel' || (!autoExport.exportFormat && autoExport.exportMode === 'standard')) && s.modeBtnActive]}
            onPress={() => {
              updateAutoExport('exportFormat', 'universal_excel');
              updateAutoExport('templateId', null);
              updateAutoExport('templateName', null);
            }}
          >
            <Text style={[s.modeTitle, (autoExport.exportFormat === 'universal_excel' || (!autoExport.exportFormat && autoExport.exportMode === 'standard')) && s.modeTitleActive]}>Universal Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeBtn, autoExport.exportFormat === 'csv' && s.modeBtnActive]}
            onPress={() => {
              updateAutoExport('exportFormat', 'csv');
              updateAutoExport('templateId', null);
              updateAutoExport('templateName', null);
            }}
          >
            <Text style={[s.modeTitle, autoExport.exportFormat === 'csv' && s.modeTitleActive]}>CSV</Text>
          </TouchableOpacity>

          {savedExportProfiles.length > 0 && (
            <>
              <Text style={[s.modeLabel, { marginTop: 14 }]}>Export Format (Custom Templates)</Text>
              {savedExportProfiles.map((profile) => (
                <TouchableOpacity
                  key={profile.id || profile.name}
                  style={[s.modeBtn, autoExport.exportFormat === 'custom_template' && autoExport.templateName === profile.name && s.modeBtnActive]}
                  onPress={() => {
                    updateAutoExport('exportFormat', 'custom_template');
                    updateAutoExport('templateId', profile.id || profile.name);
                    updateAutoExport('templateName', profile.name);
                  }}
                >
                  <Text style={[s.modeTitle, autoExport.exportFormat === 'custom_template' && autoExport.templateName === profile.name && s.modeTitleActive]}>
                    {profile.name}
                  </Text>
                  <Text style={s.profileRowSub}>
                    {profile.headers?.length || 0} columns
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>

        <View style={s.dayRow}>
          {DAYS.map((day) => (
            <TouchableOpacity
              key={day.value}
              style={[s.dayChip, (autoExport.days || []).includes(day.value) && s.dayChipActive]}
              onPress={() => toggleDay(day.value)}
            >
              <Text style={[s.dayText, (autoExport.days || []).includes(day.value) && s.dayTextActive]}>{day.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    </>
  );

  const renderBackendTab = () => (
    <>
      <SectionLabel>Supabase & Backend</SectionLabel>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={s.modeLabel}>Supabase Connection</Text>
          <TouchableOpacity
            onPress={() => {
              if (lockSupabase) {
                openAdminAuth('supabase');
              } else {
                setLockSupabase(true);
              }
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: COLORS.accent, fontWeight: '700', fontSize: 12 }}>
              {lockSupabase ? '🔓 Edit' : '🔒 Lock'}
            </Text>
          </TouchableOpacity>
        </View>

        <FieldInput
          label="Project URL"
          placeholder="https://your-project.supabase.co"
          value={lockSupabase ? '••••••••••••••••••••' : supabaseSettings.supabaseUrl}
          onChangeText={(v) => updateSupabase('supabaseUrl', v)}
          autoCapitalize="none"
          editable={!lockSupabase}
        />

        <View style={{ marginTop: 10 }}>
          <FieldInput
            label="Anon Key"
            placeholder="Paste Supabase anon key"
            value={lockSupabase ? '••••••••••••••••••••' : supabaseSettings.supabaseAnonKey}
            onChangeText={(v) => updateSupabase('supabaseAnonKey', v)}
            autoCapitalize="none"
            multiline
            secureTextEntry={lockSupabase}
            editable={!lockSupabase}
          />
        </View>

        <Text style={s.help}>Supabase credentials are locked and masked for security. Tap Edit to change them.</Text>

        <View style={{ marginTop: 10 }}>
          <FieldInput
            label="Backend Job Send Time (12h hh:mm AM/PM)"
            placeholder="5:00 PM"
            value={String(automation.sendTime || '')}
            onChangeText={(v) => updateAutomation('sendTime', v)}
          />
        </View>

        <View style={{ marginTop: 10 }}>
          <FieldInput
            label="Backend Job Recipients"
            placeholder="ops@example.com"
            value={String(automation.recipients || '')}
            onChangeText={(v) => updateAutomation('recipients', v)}
            autoCapitalize="none"
          />
        </View>

        <View style={{ marginTop: 10 }}>
          <FieldInput label="Backend Job Email Subject" value={String(automation.subject || '')} onChangeText={(v) => updateAutomation('subject', v)} />
        </View>

        <View style={{ marginTop: 10 }}>
          <FieldInput label="Backend Job Email Body" value={String(automation.body || '')} onChangeText={(v) => updateAutomation('body', v)} multiline />
        </View>

        <View style={[s.switchRow, { marginTop: 12 }]}> 
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Enable backend automation</Text>
            <Text style={s.switchSub}>Queues scheduled export jobs in Supabase when enabled.</Text>
          </View>
          <Switch value={automation.enabled} onValueChange={(v) => updateAutomation('enabled', v)} trackColor={{ true: COLORS.accent }} />
        </View>
      </Card>

      <SectionLabel>Backend Email</SectionLabel>
      <Card>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Enable backend email</Text>
            <Text style={s.switchSub}>Sends export notifications through your Netlify + Resend endpoint.</Text>
          </View>
          <Switch value={backendEmail.enabled} onValueChange={(v) => updateBackendEmail('enabled', v)} trackColor={{ true: COLORS.accent }} />
        </View>

        <View style={{ marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.modeLabel}>Endpoint Security</Text>
          <TouchableOpacity
            onPress={() => {
              if (lockBackend) {
                openAdminAuth('backend');
              } else {
                setLockBackend(true);
              }
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: COLORS.accent, fontWeight: '700', fontSize: 12 }}>
              {lockBackend ? '🔓 Edit' : '🔒 Lock'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Backend Endpoint"
            value={lockBackend ? '••••••••••••••••••••' : backendEmail.endpoint}
            onChangeText={(v) => updateBackendEmail('endpoint', v)}
            autoCapitalize="none"
            placeholder="https://okayestmedia.netlify.app/.netlify/functions/send-email"
            editable={!lockBackend}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="Recipient"
            value={backendEmail.recipient}
            onChangeText={(v) => updateBackendEmail('recipient', v)}
            autoCapitalize="none"
            placeholder="you@example.com"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput label="Subject" value={backendEmail.subject} onChangeText={(v) => updateBackendEmail('subject', v)} placeholder="LeadLens Export" />
        </View>

        <View style={{ marginTop: 12 }}>
          <FieldInput
            label="HTML Body"
            value={backendEmail.htmlBody}
            onChangeText={(v) => updateBackendEmail('htmlBody', v)}
            multiline
            numberOfLines={4}
            style={{ minHeight: 110 }}
            placeholder="<strong>Your LeadLens export is ready.</strong>"
          />
        </View>

        <PrimaryButton title="Test Backend Email" onPress={() => handleTestBackendEmail(backendEmail)} style={{ marginTop: 14 }} />
      </Card>
    </>
  );

  const renderToolsTab = () => (
    <>
      <SectionLabel>Queue Tools</SectionLabel>
      <Card>
        <Text style={s.queueCount}>{queueCount} lead{queueCount === 1 ? '' : 's'} currently in queue</Text>
        <Text style={s.help}>
          That leftover lead survived because queue data persists across updates unless you clear it. The app was being annoyingly literal, not mysterious.
        </Text>
        <PrimaryButton title="Run Local Scheduled Export Check Now" onPress={runAutoExportNow} style={{ marginTop: 12 }} />
        <Text style={s.help}>
          This manual test uses the Scheduled Auto Export settings. If those recipient fields are blank, it will borrow the backend job email fields so you do not have to play settings roulette.
        </Text>
        <PrimaryButton title="Test Supabase Connection" onPress={handleTestConnection} style={{ marginTop: 10, backgroundColor: '#6e7bff' }} />
        <PrimaryButton title="Verify Exports Bucket" onPress={handleVerifyBucket} style={{ marginTop: 10, backgroundColor: '#6e7bff' }} />
        <PrimaryButton title="Sync Queue Now" onPress={handleSyncNow} style={{ marginTop: 10, backgroundColor: '#17b26a' }} />
        <PrimaryButton title="Queue Export Job Now" onPress={handleQueueJob} style={{ marginTop: 10, backgroundColor: '#ff8b3d' }} />
        <PrimaryButton title="Clear Queue" onPress={handleClearQueue} style={{ marginTop: 10, backgroundColor: '#7a2031' }} />
      </Card>

      <SectionLabel>Background Stability</SectionLabel>
      <Card>
        <Text style={s.help}>
          Android may close apps in the background to save battery. For field use, disable battery optimization so LeadLens stays warm during the work day.
        </Text>
        <Text style={s.help}>
          Warm resume window: ~{Math.round(WORKDAY_PERSIST_MS / (60 * 60 * 1000))} hours. If the OS still kills the app, LeadLens will fast-restore your last active screen and scan context.
        </Text>
        <PrimaryButton
          title="Open Battery Optimization Settings"
          onPress={handleOpenBatteryStabilitySettings}
          style={{ marginTop: 10, backgroundColor: '#6e7bff' }}
        />
        <PrimaryButton
          title="Open App Settings"
          onPress={() => Linking.openSettings().catch(() => {})}
          style={{ marginTop: 10, backgroundColor: '#374151' }}
        />
        <Text style={s.help}>
          OEM tips: Samsung (Device Care), Pixel (Adaptive Battery), OnePlus/Xiaomi/Huawei (Auto-launch + Background restrictions). Set LeadLens to unrestricted/background allowed.
        </Text>
      </Card>
    </>
  );

  const renderInfoTab = () => (
    <>
      <SectionLabel>Software Information</SectionLabel>
      <Card>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>App Name</Text>
          <Text style={s.infoValue}>LeadLens</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Version</Text>
          <Text style={s.infoValue}>v{APP_VERSION}{Constants.expoConfig?.extra?.betaBuild ? `-BETA.${Constants.expoConfig.extra.betaBuild}` : ''}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Build Type</Text>
          <Text style={s.infoValue}>Beta Release Candidate</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Developer</Text>
          <Text style={s.infoValue}>Joseph Dugger</Text>
        </View>
      </Card>

      <SectionLabel>Feature Flags</SectionLabel>
      <Card>
        {[
          { key: 'SCAN_RECOVERY_ENABLED', enabled: SCAN_RECOVERY_ENABLED },
          { key: 'SCAN_QUEUE_PROCESSING_ENABLED', enabled: SCAN_QUEUE_PROCESSING_ENABLED },
          { key: 'OCR_IMAGE_OPTIMIZATION_ENABLED', enabled: OCR_IMAGE_OPTIMIZATION_ENABLED },
          { key: 'SCAN_ENRICHMENT_QUEUE_ENABLED', enabled: SCAN_ENRICHMENT_QUEUE_ENABLED },
        ].map((flag, idx, arr) => (
          <View key={flag.key} style={[s.infoRow, idx === arr.length - 1 && s.infoRowNoBorder]}>
            <Text style={s.infoLabel}>{flag.key}</Text>
            <Text style={[s.infoValue, { color: flag.enabled ? COLORS.success : COLORS.muted }]}>
              {flag.enabled ? 'ON' : 'OFF'}
            </Text>
          </View>
        ))}
        <Text style={s.help}>Edit `src/config/featureFlags.js` to quickly roll back beta scan features.</Text>
      </Card>

      <SectionLabel>Contact & Support</SectionLabel>
      <Card>
        <Text style={s.help}>
          For feedback, bug reports, or feature requests, please reach out directly:
        </Text>

        <TouchableOpacity
          style={s.contactRow}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        >
          <Text style={s.contactIcon}>✉️</Text>
          <View>
            <Text style={s.contactLabel}>Email</Text>
            <Text style={s.contactValue}>{SUPPORT_EMAIL}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.contactRow}
          onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}
        >
          <Text style={s.contactIcon}>📞</Text>
          <View>
            <Text style={s.contactLabel}>Phone</Text>
            <Text style={s.contactValue}>{SUPPORT_PHONE}</Text>
          </View>
        </TouchableOpacity>
      </Card>

      <SectionLabel>Legal</SectionLabel>
      <Card>
        <TouchableOpacity style={s.actionRow} onPress={() => navigation.navigate('LegalDocument', { type: 'privacy' })}>
          <Text style={s.actionLabel}>Privacy Policy</Text>
          <Text style={s.actionArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionRow} onPress={() => navigation.navigate('LegalDocument', { type: 'terms' })}>
          <Text style={s.actionLabel}>Terms of Use</Text>
          <Text style={s.actionArrow}>›</Text>
        </TouchableOpacity>
      </Card>
    </>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'experience':
        return renderExperienceTab();
      case 'exports':
        return renderExportsTab();
      case 'backend':
        return renderBackendTab();
      case 'tools':
        return renderToolsTab();
      case 'info':
        return renderInfoTab();
      case 'profile':
      default:
        return renderProfileTab();
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} badge="TABBED" />

      <View style={s.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          {SETTINGS_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[s.tabBtn, activeTab === tab.key && s.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.85}
            >
              <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {renderActiveTab()}

        <PrimaryButton
          title={saving ? 'Saving...' : 'Save Settings'}
          onPress={saveAll}
          disabled={saving}
          style={{ marginTop: 20 }}
        />
      </ScrollView>

      <Modal visible={adminAuthVisible} transparent animationType="fade">
        <View style={s.adminModalBackdrop}>
          <Card style={s.adminModalCard}>
            <Text style={s.adminModalTitle}>Admin Authentication</Text>
            <Text style={s.adminModalSub}>Enter password to unlock protected settings:</Text>
            <TextInput
              style={s.adminModalInput}
              value={adminPasswordInput}
              onChangeText={setAdminPasswordInput}
              secureTextEntry
              autoFocus
              placeholder="Admin Password"
              placeholderTextColor={COLORS.muted}
            />
            <View style={s.adminModalActions}>
              <TouchableOpacity
                style={[s.adminModalBtn, s.adminModalCancel]}
                onPress={() => { setAdminAuthVisible(false); setAdminPasswordInput(''); }}
              >
                <Text style={s.adminModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.adminModalBtn, s.adminModalUnlock]}
                onPress={handleAdminUnlock}
              >
                <Text style={s.adminModalBtnText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  tabsWrap: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: 'rgba(14,16,24,0.96)',
  },
  tabsRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
  },
  tabBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,201,255,0.12)',
  },
  tabText: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: COLORS.accent,
  },
  scroll: { flex: 1, paddingHorizontal: 16 },
  profileName: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  profileSub: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  profileGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  profileCol: { flex: 1 },
  infoRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  infoPill: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
  },
  infoPillLabel: {
    color: COLORS.label,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  infoPillValue: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  goalNote: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  goalHint: { color: COLORS.muted, fontSize: 11, lineHeight: 18, marginTop: 10 },
  signOutBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,59,92,0.5)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutText: { color: COLORS.danger, fontWeight: '700', fontSize: 14 },
  resetTutorialsBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(123,63,190,0.35)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(123,63,190,0.06)',
  },
  resetTutorialsText: { color: COLORS.purple, fontWeight: '700', fontSize: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  toggleSub: {
    fontSize: 12,
    color: '#8a9bb0',
    marginTop: 3,
    lineHeight: 18,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.muted,
  },
  toggleThumbOn: { backgroundColor: '#000', alignSelf: 'flex-end' },
  multiInput: { minHeight: 120, textAlignVertical: 'top' },
  tokenHelp: {
    color: '#8a9bb0',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 12,
  },
  resetBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 8 },
  resetText: { color: COLORS.accent2, fontWeight: '700', fontSize: 13 },
  modeLabel: {
    color: '#b0bec5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  modeBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  modeBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,201,255,0.1)',
  },
  modeTitle: { color: '#cdd9e5', fontSize: 14, fontWeight: '700' },
  modeTitleActive: { color: COLORS.accent },
  modeSub: { color: '#8a9bb0', fontSize: 12, lineHeight: 17, marginTop: 4 },
  pickerWrap: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  picker: {
    color: COLORS.text,
    height: 50,
  },
  previewBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(123,63,190,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(123,63,190,0.2)',
  },
  previewLabel: {
    color: COLORS.purple,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  previewText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  previewBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.surface3,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
  },
  previewBtnText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  switchTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  switchSub: { color: '#8a9bb0', fontSize: 12, marginTop: 4, lineHeight: 18 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  dayChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dayChipActive: {
    borderColor: 'rgba(0,201,255,0.5)',
    backgroundColor: 'rgba(0,201,255,0.14)',
  },
  dayText: { color: '#8a9bb0', fontWeight: '700', fontSize: 13 },
  dayTextActive: { color: COLORS.accent },
  help: { color: '#8a9bb0', fontSize: 12, lineHeight: 18, marginTop: 10 },
  queueCount: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  adminModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 24,
  },
  adminModalCard: {
    backgroundColor: COLORS.surface,
  },
  adminModalTitle: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  adminModalSub: {
    color: COLORS.textDim,
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
  },
  adminModalInput: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    borderRadius: 12,
    color: COLORS.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  adminModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  adminModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminModalBtnText: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 14,
  },
  adminModalCancel: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  adminModalUnlock: {
    backgroundColor: COLORS.accent,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoRowNoBorder: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    color: COLORS.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
  infoValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  contactIcon: {
    fontSize: 24,
  },
  contactLabel: {
    color: COLORS.label,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  contactValue: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  actionLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  actionArrow: {
    color: COLORS.muted,
    fontSize: 20,
  },
});
