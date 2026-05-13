import { storageBridge as AsyncStorage } from './storage';

const TASK_QUEUE_KEY = '@leadlens_task_queue';

export const TASK_TYPES = {
  LEAD_SYNC: 'SYNC_PROSPECT',
  SYNC_ALL: 'SYNC_ALL_PROSPECTS',
  ENRICH_LEAD: 'ENRICH_LEAD',
  EXTRACT_LEADS: 'EXTRACT_LEADS_FROM_IMAGE',
  AUTO_EXPORT: 'AUTO_EXPORT',
  EXCEL_IMPORT: 'PROCESS_EXCEL_IMPORT',
  NEARBY_HYDRATE: 'NEARBY_HYDRATE',
};

export const TASK_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export async function getTaskQueue() {
  try {
    const raw = await AsyncStorage.getItem(TASK_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('[TaskQueue] Load failed:', err);
    return [];
  }
}

export async function saveTaskQueue(queue) {
  try {
    await AsyncStorage.setItem(TASK_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('[TaskQueue] Save failed:', err);
  }
}

export async function enqueueTask(type, payload, options = {}) {
  const queue = await getTaskQueue();
  const newTask = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    status: TASK_STATUS.PENDING,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: options.maxRetries ?? 3,
    ...options,
  };
  queue.push(newTask);
  await saveTaskQueue(queue);
  console.log(`[TaskQueue] Enqueued ${type}: ${newTask.id}`);
  return newTask;
}

export async function updateTaskStatus(taskId, status, extra = {}) {
  const queue = await getTaskQueue();
  const index = queue.findIndex((t) => t.id === taskId);
  if (index === -1) return;

  queue[index] = {
    ...queue[index],
    status,
    updatedAt: new Date().toISOString(),
    ...extra,
  };

  // If completed, we might want to keep it for history or remove it
  // For MVP, let's keep only non-completed tasks to keep queue small
  if (status === TASK_STATUS.COMPLETED) {
    queue.splice(index, 1);
  }

  await saveTaskQueue(queue);
}

export async function clearCompletedTasks() {
  const queue = await getTaskQueue();
  const pending = queue.filter((t) => t.status !== TASK_STATUS.COMPLETED);
  await saveTaskQueue(pending);
}
