import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AUTO_EXPORT_SETTINGS_KEY,
  AUTO_INTRO_KEY,
  AUTOMATION_SETTINGS_KEY,
  COLORS,
  DEFAULT_INTRO_TEMPLATES,
  EXPORT_MODES,
  LEADS_STORAGE_KEY,
  SUPABASE_SETTINGS_KEY,
  USER_STORAGE_KEY,
} from '../constants';
import { ScreenHeader, FieldInput, PrimaryButton, Card, SectionLabel } from '../components/UI';
import {
  getExportSettings,
  getIntroTemplates,
  resetIntroTemplates,
  saveExportSettings,
  saveIntroTemplates,
} from '../utils/templateSettings';
import { maybeRunAutoExport } from '../utils/autoExport';
import { createSupabaseClient } from '../utils/supabaseClient';
import { queueScheduledExport, syncQueueToSupabase } from '../utils/backendSync';

import { sendBackendEmail } from '../utils/backendEmail';

async function handleTestBackendEmail(settings) {
  try {
    if (!settings?.endpoint || !settings?.recipient) {
      Alert.alert(
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

    Alert.alert('Success', 'Backend email sent successfully.');
  } catch (error) {
    Alert.alert('Backend Email Failed', error?.message || 'Unknown error');
  }
}
const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const DEFAULT_AUTO_EXPORT = {
  enabled: false,
  time: '17:00',
  recipients: '',
  subject: 'LeadLens Scheduled Export ({count} leads)',
  body: 'Attached is your scheduled LeadLens export containing {count} queued leads.',
  exportMode: 'template',
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
  sendTime: '17:00',
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

const [backendEmail, setBackendEmail] = useState(DEFAULT_BACKEND_EMAIL);
const updateBackendEmail = (key, value) =>
  setBackendEmail((prev) => ({ ...prev, [key]: value }));

export default function SettingsScreen({ navigation, route }) {
  const { user } = route.params;
  const [templates, setTemplates] = useState(DEFAULT_INTRO_TEMPLATES);
  const [autoIntro, setAutoIntro] = useState(true);
  const [defaultExportMode, setDefaultExportMode] = useState(EXPORT_MODES.SALES_TEMPLATE);
  const [autoExport, setAutoExport] = useState(DEFAULT_AUTO_EXPORT);
  const [supabaseSettings, setSupabaseSettings] = useState(DEFAULT_SUPABASE);
  const [automation, setAutomation] = useState(DEFAULT_AUTOMATION);
  const [queueCount, setQueueCount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [rawBackendEmail, ...rest] = await Promise.all([
  AsyncStorage.getItem(BACKEND_EMAIL_SETTINGS_KEY),
  // keep the rest of your existing Promise.all items
]);
if (rawBackendEmail) {
  try {
    setBackendEmail({
      ...DEFAULT_BACKEND_EMAIL,
      ...JSON.parse(rawBackendEmail),
    });
  } catch {}
}
      const [
        savedTemplates,
        exportSettings,
        storedAutoIntro,
        rawAutoExport,
        rawSupabase,
        rawAutomation,
        rawQueue,
      ] = await Promise.all([
        getIntroTemplates(),
        getExportSettings(),
        AsyncStorage.getItem(AUTO_INTRO_KEY),
        AsyncStorage.getItem(AUTO_EXPORT_SETTINGS_KEY),
        AsyncStorage.getItem(SUPABASE_SETTINGS_KEY),
        AsyncStorage.getItem(AUTOMATION_SETTINGS_KEY),
        AsyncStorage.getItem(LEADS_STORAGE_KEY),
      ]);
      if (!mounted) return;
      setTemplates(savedTemplates);
      setDefaultExportMode(exportSettings.mode || EXPORT_MODES.SALES_TEMPLATE);
      if (storedAutoIntro !== null) setAutoIntro(storedAutoIntro === 'true');
      if (rawAutoExport) {
        try { setAutoExport({ ...DEFAULT_AUTO_EXPORT, ...JSON.parse(rawAutoExport) }); } catch {}
      }
      if (rawSupabase) {
        try { setSupabaseSettings({ ...DEFAULT_SUPABASE, ...JSON.parse(rawSupabase) }); } catch {}
      }
      if (rawAutomation) {
        try { setAutomation({ ...DEFAULT_AUTOMATION, ...JSON.parse(rawAutomation) }); } catch {}
      }
      if (rawBackendEmail) {
  try {
    setBackendEmail({
      ...DEFAULT_BACKEND_EMAIL,
      ...JSON.parse(rawBackendEmail),
    });
  } catch {}
}
      const parsedQueue = rawQueue ? JSON.parse(rawQueue) : [];
      setQueueCount(Array.isArray(parsedQueue) ? parsedQueue.length : 0);
    })();

    return () => { mounted = false; };
  }, []);

  const updateTemplate = (key, value) => setTemplates((prev) => ({ ...prev, [key]: value }));
  const updateAutoExport = (key, value) => setAutoExport((prev) => ({ ...prev, [key]: value }));
  const updateSupabase = (key, value) => setSupabaseSettings((prev) => ({ ...prev, [key]: value }));
  const updateAutomation = (key, value) => setAutomation((prev) => ({ ...prev, [key]: value }));

  const saveAll = async () => {
    AsyncStorage.setItem(
  BACKEND_EMAIL_SETTINGS_KEY,
  JSON.stringify(backendEmail)
),
    setSaving(true);
    try {
      await Promise.all([
        saveIntroTemplates(templates),
        saveExportSettings({ mode: defaultExportMode }),
        AsyncStorage.setItem(AUTO_INTRO_KEY, String(autoIntro)),
        AsyncStorage.setItem(AUTO_EXPORT_SETTINGS_KEY, JSON.stringify(autoExport)),
        AsyncStorage.setItem(SUPABASE_SETTINGS_KEY, JSON.stringify(supabaseSettings)),
        AsyncStorage.setItem(AUTOMATION_SETTINGS_KEY, JSON.stringify(automation)),
      ]);
      Alert.alert('Saved', 'Your settings were merged back together and saved. Civilization restored, more or less.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetTemplates = () => {
    Alert.alert('Reset templates', 'Restore the default email and text templates?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          const restored = await resetIntroTemplates();
          setTemplates(restored);
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Clear your saved session and return to login?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(USER_STORAGE_KEY);
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  const toggleDay = (day) => {
    const current = new Set(autoExport.days || []);
    if (current.has(day)) current.delete(day); else current.add(day);
    updateAutoExport('days', Array.from(current).sort((a, b) => a - b));
  };

  const runAutoExportNow = async () => {
    const mergedSettings = {
      ...autoExport,
      enabled: true,
      recipients: autoExport.recipients || automation.recipients || '',
      subject: autoExport.subject || automation.subject || 'LeadLens Scheduled Export ({count} leads)',
      body: autoExport.body || automation.body || 'Attached is your scheduled LeadLens export containing {count} queued leads.',
      lastRunDate: '',
    };

    await AsyncStorage.setItem(AUTO_EXPORT_SETTINGS_KEY, JSON.stringify(mergedSettings));
    const result = await maybeRunAutoExport(user, { force: true, settingsOverride: mergedSettings });

    if (result.sent) {
      if (result.usedComposer) {
        Alert.alert(
          'Auto export check',
          `Prepared ${result.count} lead(s) for email${result.recipientsCount ? ` to ${result.recipientsCount} saved recipient(s)` : ''}.`
        );
      } else {
        Alert.alert(
          'Auto export check',
          `Generated ${result.count} lead(s) and opened the share sheet because no dedicated mail composer was available.`
        );
      }
      return;
    }

    Alert.alert('Auto export check', result.reason || 'Nothing to send right now.');
  };

  const handleTestConnection = async () => {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) {
      Alert.alert('Missing config', 'Enter your Supabase URL and anon key first.');
      return;
    }
    const { error } = await supabase.from('queue_items').select('id').limit(1);
    if (error) Alert.alert('Connection failed', error.message);
    else Alert.alert('Connected', 'Supabase responded successfully.');
  };

  const handleSyncNow = async () => {
    const res = await syncQueueToSupabase(user, supabaseSettings);
    if (!res.ok) Alert.alert('Sync failed', res.reason || 'Unknown issue');
    else Alert.alert('Sync complete', res.reason === 'empty-queue' ? 'Queue is empty.' : `${res.count || 0} lead(s) pushed to Supabase.`);
  };

  const handleQueueJob = async () => {
    const res = await queueScheduledExport(user, supabaseSettings);
    if (!res.ok) Alert.alert('Queue job failed', res.reason || 'Unknown issue');
    else Alert.alert('Queued', res.reason === 'empty-queue' ? 'No leads are in queue right now.' : 'A scheduled export job was queued in Supabase.');
  };

  const handleClearQueue = () => {
    if (!queueCount) {
      Alert.alert('Queue is already empty');
      return;
    }
    Alert.alert('Clear queue', `Remove all ${queueCount} lead(s) from the queue?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(LEADS_STORAGE_KEY);
          setQueueCount(0);
          Alert.alert('Queue cleared');
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title="Settings" onBack={() => navigation.goBack()} badge="MERGED" />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <SectionLabel>Session</SectionLabel>
        <Card>
          <Text style={s.profileName}>{user.repName}</Text>
          <Text style={s.profileSub}>{user.role} · Branch {user.branchNum || '—'} · EMP {user.employeeNum}</Text>
          <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>
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
            <FieldInput label="Email Subject" value={templates.emailSubject} onChangeText={(value) => updateTemplate('emailSubject', value)} placeholder="Introduction from {repName}" />
          </View>
          <View style={{ marginTop: 12 }}>
            <FieldInput label="Email Body" value={templates.emailBody} onChangeText={(value) => updateTemplate('emailBody', value)} placeholder="Hi {contactName}..." multiline numberOfLines={8} style={s.multiInput} />
          </View>
          <View style={{ marginTop: 12 }}>
            <FieldInput label="Text Message Body" value={templates.smsBody} onChangeText={(value) => updateTemplate('smsBody', value)} placeholder="Hi {firstName}..." multiline numberOfLines={5} style={s.multiInput} />
          </View>
          <Text style={s.tokenHelp}>Tokens: {'{repName}'}, {'{businessName}'}, {'{firstName}'}, {'{lastName}'}, {'{contactName}'}, {'{branchNum}'}, {'{city}'}, {'{state}'}</Text>
          <TouchableOpacity style={s.resetBtn} onPress={handleResetTemplates}>
            <Text style={s.resetText}>Reset templates to default</Text>
          </TouchableOpacity>
        </Card>

        <SectionLabel>Export Defaults</SectionLabel>
        <Card>
          <Text style={s.modeLabel}>Default Export Mode</Text>
          <TouchableOpacity style={[s.modeBtn, defaultExportMode === EXPORT_MODES.SALES_TEMPLATE && s.modeBtnActive]} onPress={() => setDefaultExportMode(EXPORT_MODES.SALES_TEMPLATE)}>
            <Text style={[s.modeTitle, defaultExportMode === EXPORT_MODES.SALES_TEMPLATE && s.modeTitleActive]}>Sales Template</Text>
            <Text style={s.modeSub}>Uses the current sales import layout.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.modeBtn, defaultExportMode === EXPORT_MODES.STANDARD && s.modeBtnActive]} onPress={() => setDefaultExportMode(EXPORT_MODES.STANDARD)}>
            <Text style={[s.modeTitle, defaultExportMode === EXPORT_MODES.STANDARD && s.modeTitleActive]}>Standard Spreadsheet</Text>
            <Text style={s.modeSub}>Exports a general lead file without the sales template layout.</Text>
          </TouchableOpacity>
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
            <FieldInput label="Send Time (24h HH:MM)" value={autoExport.time} onChangeText={(v) => updateAutoExport('time', v)} />
          </View>
          <View style={{ marginTop: 12 }}>
            <FieldInput label="Recipients" value={autoExport.recipients} onChangeText={(v) => updateAutoExport('recipients', v)} placeholder="you@company.com, team@company.com" />
          </View>
          <View style={{ marginTop: 12 }}>
            <FieldInput label="Subject" value={autoExport.subject} onChangeText={(v) => updateAutoExport('subject', v)} />
          </View>
          <View style={{ marginTop: 12 }}>
            <FieldInput label="Body" value={autoExport.body} onChangeText={(v) => updateAutoExport('body', v)} multiline numberOfLines={4} style={{ minHeight: 110 }} />
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={s.modeLabel}>Export Format</Text>
            <TouchableOpacity style={[s.modeBtn, autoExport.exportMode !== 'standard' && s.modeBtnActive]} onPress={() => updateAutoExport('exportMode', 'template')}>
              <Text style={[s.modeTitle, autoExport.exportMode !== 'standard' && s.modeTitleActive]}>Sales Template</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modeBtn, autoExport.exportMode === 'standard' && s.modeBtnActive]} onPress={() => updateAutoExport('exportMode', 'standard')}>
              <Text style={[s.modeTitle, autoExport.exportMode === 'standard' && s.modeTitleActive]}>Standard Spreadsheet</Text>
            </TouchableOpacity>
          </View>
          <View style={s.dayRow}>
            {DAYS.map((day) => (
              <TouchableOpacity key={day.value} style={[s.dayChip, (autoExport.days || []).includes(day.value) && s.dayChipActive]} onPress={() => toggleDay(day.value)}>
                <Text style={[s.dayText, (autoExport.days || []).includes(day.value) && s.dayTextActive]}>{day.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <SectionLabel>Supabase & Backend</SectionLabel>
        <Card>
          <FieldInput label="Project URL" placeholder="https://your-project.supabase.co" value={supabaseSettings.supabaseUrl} onChangeText={(v) => updateSupabase('supabaseUrl', v)} autoCapitalize="none" />
          <View style={{ marginTop: 10 }}>
            <FieldInput label="Anon Key" placeholder="Paste Supabase anon key" value={supabaseSettings.supabaseAnonKey} onChangeText={(v) => updateSupabase('supabaseAnonKey', v)} autoCapitalize="none" multiline />
          </View>
          <Text style={s.help}>This keeps the Supabase controls you added in Stage 5 instead of hiding them in a side room.</Text>
          <View style={{ marginTop: 10 }}>
            <FieldInput label="Backend Job Send Time" placeholder="17:00" value={automation.sendTime} onChangeText={(v) => updateAutomation('sendTime', v)} />
          </View>
          <View style={{ marginTop: 10 }}>
            <FieldInput label="Backend Job Recipients" placeholder="ops@example.com" value={automation.recipients} onChangeText={(v) => updateAutomation('recipients', v)} autoCapitalize="none" />
          </View>
          <View style={{ marginTop: 10 }}>
            <FieldInput label="Backend Job Email Subject" value={automation.subject} onChangeText={(v) => updateAutomation('subject', v)} />
          </View>
          <View style={{ marginTop: 10 }}>
            <FieldInput label="Backend Job Email Body" value={automation.body} onChangeText={(v) => updateAutomation('body', v)} multiline />
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
      <Text style={s.switchSub}>
        Sends export notifications through your Netlify + Resend endpoint.
      </Text>
    </View>
    <Switch
      value={backendEmail.enabled}
      onValueChange={(v) => updateBackendEmail('enabled', v)}
      trackColor={{ true: COLORS.accent }}
    />
  </View>

  <View style={{ marginTop: 12 }}>
    <FieldInput
      label="Backend Endpoint"
      value={backendEmail.endpoint}
      onChangeText={(v) => updateBackendEmail('endpoint', v)}
      autoCapitalize="none"
      placeholder="https://okayestmedia.netlify.app/.netlify/functions/send-email"
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
    <FieldInput
      label="Subject"
      value={backendEmail.subject}
      onChangeText={(v) => updateBackendEmail('subject', v)}
      placeholder="LeadLens Export"
    />
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

  <PrimaryButton
    title="Test Backend Email"
    onPress={() => handleTestBackendEmail(backendEmail)}
    style={{ marginTop: 14 }}
  />
</Card>
        <SectionLabel>Queue Tools</SectionLabel>
        <Card>
          <Text style={s.queueCount}>{queueCount} lead{queueCount === 1 ? '' : 's'} currently in queue</Text>
          <Text style={s.help}>That leftover lead survived because queue data persists across updates unless you clear it. The app was being annoyingly literal, not mysterious.</Text>
          <PrimaryButton title="Run Local Scheduled Export Check Now" onPress={runAutoExportNow} style={{ marginTop: 12 }} />
          <Text style={s.help}>This manual test uses the Scheduled Auto Export settings. If those recipient fields are blank, it will borrow the backend job email fields so you do not have to play settings roulette.</Text>
          <PrimaryButton title="Test Supabase Connection" onPress={handleTestConnection} style={{ marginTop: 10, backgroundColor: '#6e7bff' }} />
          <PrimaryButton title="Sync Queue Now" onPress={handleSyncNow} style={{ marginTop: 10, backgroundColor: '#17b26a' }} />
          <PrimaryButton title="Queue Export Job Now" onPress={handleQueueJob} style={{ marginTop: 10, backgroundColor: '#ff8b3d' }} />
          <PrimaryButton title="Clear Queue" onPress={handleClearQueue} style={{ marginTop: 10, backgroundColor: '#7a2031' }} />
        </Card>

        <PrimaryButton title={saving ? 'Saving...' : 'Save Settings'} onPress={saveAll} disabled={saving} style={{ marginTop: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  profileName: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  profileSub: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  signOutBtn: { marginTop: 14, borderWidth: 1, borderColor: 'rgba(255,59,92,0.35)', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  signOutText: { color: COLORS.danger, fontWeight: '700', fontSize: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  toggleSub: { fontSize: 11, color: COLORS.muted, marginTop: 2, lineHeight: 16 },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', paddingHorizontal: 2 },
  toggleOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.muted },
  toggleThumbOn: { backgroundColor: '#000', alignSelf: 'flex-end' },
  multiInput: { minHeight: 120, textAlignVertical: 'top' },
  tokenHelp: { color: COLORS.muted, fontSize: 11, lineHeight: 18, marginTop: 12 },
  resetBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 8 },
  resetText: { color: COLORS.accent2, fontWeight: '700', fontSize: 13 },
  modeLabel: { color: COLORS.label, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  modeBtn: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface2, borderRadius: 12, padding: 14, marginBottom: 10 },
  modeBtnActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(0,201,255,0.08)' },
  modeTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  modeTitleActive: { color: COLORS.accent },
  modeSub: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  switchSub: { color: COLORS.muted, fontSize: 12, marginTop: 4, lineHeight: 18 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  dayChip: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, marginRight: 8, marginBottom: 8 },
  dayChipActive: { borderColor: 'rgba(0,201,255,0.4)', backgroundColor: 'rgba(0,201,255,0.12)' },
  dayText: { color: COLORS.muted, fontWeight: '700' },
  dayTextActive: { color: COLORS.accent },
  help: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  queueCount: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
});
