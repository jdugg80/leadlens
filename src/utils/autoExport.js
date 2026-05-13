import { storageBridge as AsyncStorage } from './storage';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { AUTO_EXPORT_SETTINGS_KEY, LEADS_STORAGE_KEY, USER_STORAGE_KEY } from '../constants';
import { buildXlsxUri } from './exportXlsx';
import { enqueueTask, TASK_TYPES } from './taskQueue';
import { processQueue } from './taskRunner';

const AUTO_EXPORT_TASK_NAME = 'BACKGROUND_AUTO_EXPORT_TASK';
const TASK_QUEUE_PROCESSOR_NAME = 'BACKGROUND_TASK_QUEUE_PROCESSOR';

let appStateListenerBound = false;
let appStateCallback = null;

function parseTimeToMinutes(time = '16:00') {
  const raw = String(time || '16:00').trim();
  const match = raw.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i);
  if (!match) {
    return 16 * 60;
  }

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

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 16 * 60;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return 16 * 60;
  }

  return hour * 60 + minute;
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
  const { force = false, settingsOverride = null, isBackground = false } = options;

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

  // Background tasks cannot show UI (Sharing/MailComposer with UI)
  // If we are in background, we might need a non-interactive way to send
  // For now, we'll focus on the logic and assume resume-based triggers for UI interaction.
  if (isBackground && !force) {
     // If we're backgrounded, we can't pop the MailComposer or Share sheet.
     // We just log that it's ready.
     return { skipped: true, reason: 'background execution requires user interaction for mail/share' };
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

// Register background task
TaskManager.defineTask(AUTO_EXPORT_TASK_NAME, async () => {
  try {
    const rawUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
    const user = rawUser ? JSON.parse(rawUser) : null;
    if (!user) return BackgroundFetch.BackgroundFetchResult.NoData;

    const result = await maybeRunAutoExport(user, { isBackground: true });
    return result.sent ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

TaskManager.defineTask(TASK_QUEUE_PROCESSOR_NAME, async () => {
  try {
    await processQueue();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.error('[BackgroundTasks] Queue processing failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundAutoExport() {
  await BackgroundFetch.registerTaskAsync(TASK_QUEUE_PROCESSOR_NAME, {
    minimumInterval: 60 * 15,
    stopOnTerminate: false,
    startOnBoot: true,
  });

  return BackgroundFetch.registerTaskAsync(AUTO_EXPORT_TASK_NAME, {
    minimumInterval: 60 * 15, // 15 minutes
    stopOnTerminate: false, // android only
    startOnBoot: true, // android only
  });
}

export async function unregisterBackgroundAutoExport() {
  return BackgroundFetch.unregisterTaskAsync(AUTO_EXPORT_TASK_NAME);
}

export async function enqueueAutoExport(options = {}) {
  return enqueueTask(TASK_TYPES.AUTO_EXPORT, { options });
}
