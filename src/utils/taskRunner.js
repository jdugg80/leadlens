import { getTaskQueue, updateTaskStatus, TASK_STATUS, TASK_TYPES } from './taskQueue';
import { syncAllProspectsToSupabase } from './backendSync';
import { enrichLead, extractLeadsWithDebugFromImage } from './claudeApi';
import { maybeRunAutoExport } from './autoExport';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { USER_STORAGE_KEY } from '../constants';

let isProcessing = false;

export async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const queue = await getTaskQueue();
    const pendingTasks = queue.filter((t) => t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.FAILED);

    for (const task of pendingTasks) {
      if (task.retryCount >= task.maxRetries) {
        await updateTaskStatus(task.id, TASK_STATUS.FAILED, { error: 'Max retries exceeded' });
        continue;
      }

      await updateTaskStatus(task.id, TASK_STATUS.RUNNING);

      try {
        const result = await executeTask(task);
        if (result.success) {
          await updateTaskStatus(task.id, TASK_STATUS.COMPLETED);
        } else {
          await updateTaskStatus(task.id, TASK_STATUS.FAILED, {
            error: result.error,
            retryCount: task.retryCount + 1
          });
        }
      } catch (err) {
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
      // Logic to update local lead after enrichment
      // Note: task payload should probably have lead index or ID
      return { success: true, data: res };
    }

    case TASK_TYPES.EXTRACT_LEADS: {
      const { imageUri, mimeType } = payload;
      const b64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const res = await extractLeadsWithDebugFromImage(b64, mimeType);
      return { success: true, data: res };
    }

    case TASK_TYPES.AUTO_EXPORT: {
      const rawUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
      const user = rawUser ? JSON.parse(rawUser) : null;
      if (!user) return { success: false, error: 'User not found' };
      const res = await maybeRunAutoExport(user, payload.options);
      return res.sent || res.skipped ? { success: true } : { success: false, error: res.reason };
    }

    default:
      return { success: false, error: `Unknown task type: ${type}` };
  }
}
