import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { AppState } from 'react-native';
import { AUTO_EXPORT_SETTINGS_KEY, LEADS_STORAGE_KEY } from '../constants';
import { buildXlsxUri } from './exportXlsx';

let appStateListenerBound = false;
let appStateCallback = null;

function parseTimeToMinutes(time = '17:00') {
  const [h, m] = String(time || '17:00').split(':').map((v) => parseInt(v, 10));
  return ((Number.isFinite(h) ? h : 17) * 60) + (Number.isFinite(m) ? m : 0);
}

function normalizeRecipients(value = '') {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function loadAutoExportSettings() {
  const raw = await AsyncStorage.getItem(AUTO_EXPORT_SETTINGS_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function maybeRunAutoExport(user, options = {}) {
  const { force = false, settingsOverride = null } = options;

  const loadedSettings = await loadAutoExportSettings();
  const settings = settingsOverride || loadedSettings;
  if (!settings?.enabled && !force) return { skipped: true, reason: 'disabled' };
  if (!settings) return { skipped: true, reason: 'missing settings' };

  const now = new Date();
  const weekday = now.getDay();
  const days = Array.isArray(settings.days) ? settings.days : [1, 2, 3, 4, 5];

  if (!force && !days.includes(weekday)) {
    return { skipped: true, reason: 'day not selected' };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const scheduledMinutes = parseTimeToMinutes(settings.time);
  if (!force && currentMinutes < scheduledMinutes) {
    return { skipped: true, reason: 'not time yet' };
  }

  const stamp = now.toISOString().slice(0, 10);
  if (!force && settings.lastRunDate === stamp) {
    return { skipped: true, reason: 'already ran today' };
  }

  const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
  const leads = raw ? JSON.parse(raw) : [];
  const queued = settings.reviewedOnly ? leads.filter((lead) => lead.reviewed) : leads;
  const sendable = settings.excludeDuplicates ? queued.filter((lead) => !lead.duplicateWarning) : queued;

  if (!sendable.length) {
    await saveAutoExportSettings({ ...settings, lastRunDate: stamp, lastStatus: 'No queued leads to send' });
    return { skipped: true, reason: 'empty queue' };
  }

  const attachment = await buildXlsxUri(sendable, user, { mode: settings.exportMode || 'template' });
  const subject = (settings.subject || 'LeadLens Scheduled Export').replace('{count}', String(sendable.length));
  const body = (settings.body || 'Attached is your scheduled LeadLens export.').replace('{count}', String(sendable.length));
  const recipients = normalizeRecipients(settings.recipients);

  const mailAvailable = await MailComposer.isAvailableAsync();
  let usedComposer = false;

  if (mailAvailable) {
    try {
      await MailComposer.composeAsync({
        recipients,
        subject,
        body,
        attachments: [attachment],
      });
      usedComposer = true;
    } catch {
      usedComposer = false;
    }
  }

  if (!usedComposer) {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      await saveAutoExportSettings({ ...settings, lastStatus: 'Mail composer and sharing unavailable' });
      return { skipped: true, reason: 'mail and share unavailable' };
    }

    await Sharing.shareAsync(attachment, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: recipients.length
        ? 'Choose an email app or share the export file'
        : 'Choose an app to share the export file',
      UTI: 'com.microsoft.excel.xlsx',
    });
  }

  let nextLeads = leads;
  if (settings.clearAfterSend) {
    nextLeads = leads.filter((lead) => !sendable.some((sent) => sent.id === lead.id));
    await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(nextLeads));
  } else if (settings.archiveAfterSend) {
    nextLeads = leads.map((lead) =>
      sendable.some((sent) => sent.id === lead.id)
        ? { ...lead, archived: true, sentAt: new Date().toISOString() }
        : lead
    );
    await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(nextLeads));
  }

  await saveAutoExportSettings({
    ...settings,
    lastRunDate: stamp,
    lastStatus: usedComposer
      ? `Queued ${sendable.length} lead(s) into the mail composer`
      : `Generated ${sendable.length} lead(s) and opened the share sheet`,
  });

  return {
    sent: true,
    count: sendable.length,
    usedComposer,
    fallbackShare: !usedComposer,
    recipientsCount: recipients.length,
  };
}

export async function saveAutoExportSettings(settings) {
  await AsyncStorage.setItem(AUTO_EXPORT_SETTINGS_KEY, JSON.stringify(settings));
}

export function bindAutoExportOnAppResume(user) {
  if (appStateListenerBound) return;
  appStateCallback = (state) => {
    if (state === 'active') {
      maybeRunAutoExport(user).catch(() => {});
    }
  };
  AppState.addEventListener('change', appStateCallback);
  appStateListenerBound = true;
}
