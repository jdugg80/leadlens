import { enqueueTask, getTaskQueue, updateTaskStatus, TASK_STATUS, TASK_TYPES } from './taskQueue';
import { syncAllProspectsToSupabase } from './backendSync';
import { enrichLead, extractLeadsWithDebugFromImage } from './claudeApi';
import { fetchPlaceDetails, parseAddressComponents } from './nearbySearch';
import { extractSocialLinksFromWebsite, socialLinksToLeadFields } from './socialEnrichment';
import * as FileSystem from 'expo-file-system';
import { storageBridge as AsyncStorage } from './storage';
import { USER_STORAGE_KEY, LEADS_STORAGE_KEY, EMPTY_LEAD } from '../constants';
import { normalizeLead, splitStreetAddress, inferVertical } from './leadProcessing';
import { read, utils } from 'xlsx';

let isProcessing = false;

export async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // ─── Auto-enqueue periodic Supabase sync ──────────────────────────────
    // On every processQueue cycle (app startup, resume, background 15-min),
    // ensure a SYNC_ALL task exists in the queue. Skip if one is already
    // pending/running to avoid duplicate work.
    try {
      const currentQueue = await getTaskQueue();
      const hasSyncPending = currentQueue.some(
        (t) => t.type === TASK_TYPES.SYNC_ALL
          && (t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING)
      );
      if (!hasSyncPending) {
        await enqueueTask(TASK_TYPES.SYNC_ALL, {});
      }
    } catch (syncErr) {
      console.warn('[TaskQueue] Auto-enqueue SYNC_ALL failed:', syncErr?.message);
    }
    // ─── End auto-enqueue ─────────────────────────────────────────────────

    const queue = await getTaskQueue();
    const pendingTasks = queue.filter((t) => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.FAILED);

    if (!pendingTasks.length) {
      console.log('[TaskQueue] Queue empty, nothing to process');
      return;
    }

    console.log(`[TaskQueue] Processing ${pendingTasks.length} pending task(s)`);

    for (const task of pendingTasks) {
      if (task.retryCount >= task.maxRetries) {
        console.warn(`[TaskQueue] Max retries exceeded for ${task.type}: ${task.id}`);
        await updateTaskStatus(task.id, TASK_STATUS.FAILED, { error: 'Max retries exceeded' });
        continue;
      }

      await updateTaskStatus(task.id, TASK_STATUS.RUNNING);
      console.log(`[TaskQueue] Executing ${task.type}: ${task.id}`);

      try {
        const result = await executeTask(task);
        if (result.success) {
          console.log(`[TaskQueue] Completed ${task.type}: ${task.id}`);
          await updateTaskStatus(task.id, TASK_STATUS.COMPLETED);
        } else {
          console.error(`[TaskQueue] Failed ${task.type}: ${task.id}`, result.error);
          await updateTaskStatus(task.id, TASK_STATUS.FAILED, {
            error: result.error,
            retryCount: task.retryCount + 1
          });
        }
      } catch (err) {
        console.error(`[TaskQueue] Failed ${task.type}: ${task.id}`, err?.message || err);
        await updateTaskStatus(task.id, TASK_STATUS.FAILED, {
          error: err.message,
          retryCount: task.retryCount + 1
        });
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function executeTask(task) {
  const { type, payload } = task;

  switch (type) {
    case TASK_TYPES.SYNC_ALL: {
      const rawUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
      const user = rawUser ? JSON.parse(rawUser) : null;
      if (!user) return { success: false, error: 'User not authenticated' };
      const res = await syncAllProspectsToSupabase(user, payload.supabaseSettings);
      return res.ok ? { success: true } : { success: false, error: res.reason };
    }

    case TASK_TYPES.ENRICH_LEAD: {
      const res = await enrichLead(payload.lead);
      if (!res) return { success: false, error: 'enrichLead returned null' };
      return { success: true, data: res };
    }

    case TASK_TYPES.EXTRACT_LEADS: {
      const { imageUri, mimeType } = payload;
      const b64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });
      const res = await extractLeadsWithDebugFromImage(b64, mimeType);
      return { success: true, data: res };
    }

    case TASK_TYPES.AUTO_EXPORT: {
      const rawUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
      const user = rawUser ? JSON.parse(rawUser) : null;
      if (!user) return { success: false, error: 'User not found' };
      const { maybeRunAutoExport } = require('./autoExport');
      const res = await maybeRunAutoExport(user, payload.options);
      return res.sent || res.skipped ? { success: true } : { success: false, error: res.reason };
    }

    case TASK_TYPES.EXCEL_IMPORT: {
      const { uri, headerAliases } = payload;
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { defval: '' });

      const getMappedValue = (row, aliasArray = []) => {
        for (const alias of aliasArray) {
          if (row[alias]) return String(row[alias]);
        }
        return '';
      };

      const newLeads = rows.map((row) => {
        const split = splitStreetAddress(getMappedValue(row, headerAliases.streetAddress));
        const base = normalizeLead({
          ...EMPTY_LEAD,
          businessName: getMappedValue(row, headerAliases.businessName),
          pocFirst: getMappedValue(row, headerAliases.pocFirst),
          pocLast: getMappedValue(row, headerAliases.pocLast),
          phone: getMappedValue(row, headerAliases.phone),
          email: getMappedValue(row, headerAliases.email),
          website: getMappedValue(row, headerAliases.website),
          streetNumber: split.streetNumber,
          streetName: split.streetName,
          city: getMappedValue(row, headerAliases.city),
          state: getMappedValue(row, headerAliases.state),
          zip: getMappedValue(row, headerAliases.zip),
          captureMethod: 'excel-import',
        });
        const inferred = inferVertical(base);
        return { ...base, ...inferred, reviewed: false, id: `excel_${Date.now()}_${Math.random()}` };
      }).filter((lead) => lead.businessName || lead.phone || lead.email);

      const rawLeads = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
      const leads = rawLeads ? JSON.parse(rawLeads) : [];
      await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify([...leads, ...newLeads]));
      return { success: true, count: newLeads.length };
    }

    case TASK_TYPES.NEARBY_HYDRATE: {
        // ... (existing logic)
    }

    default:
      return { success: false, error: `Unknown task type: ${type}` };
  }
}
