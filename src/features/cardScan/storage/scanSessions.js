import { getDb } from './scanDb';
import { SCAN_SESSION_STATUS, SCAN_SOURCES } from '../constants/scanStatuses';

function generateId() {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function nowISO() {
  return new Date().toISOString();
}

export async function createScanSession({ source = SCAN_SOURCES.BUSINESS_CARD_BATCH } = {}) {
  const db = await getDb();
  const id = generateId();
  const now = nowISO();

  await db.runAsync(
    `INSERT INTO scan_sessions (id, created_at, updated_at, status, total_cards, processed_count, failed_count, last_processed_index, source)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?)`,
    [id, now, now, SCAN_SESSION_STATUS.SCANNING, source]
  );

  console.log('[scanSessions] Created session:', id);
  return id;
}

export async function getActiveScanSessions() {
  const db = await getDb();
  const activeStatuses = [
    SCAN_SESSION_STATUS.SCANNING,
    SCAN_SESSION_STATUS.PROCESSING,
    SCAN_SESSION_STATUS.PAUSED,
    SCAN_SESSION_STATUS.FAILED,
    SCAN_SESSION_STATUS.ACTIVE,
  ];
  const rows = await db.getAllAsync(
    `SELECT * FROM scan_sessions WHERE status IN (?, ?, ?, ?, ?) ORDER BY updated_at DESC`,
    activeStatuses
  );
  return rows;
}

export async function getScanSessionById(sessionId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT * FROM scan_sessions WHERE id = ?`,
    [sessionId]
  );
  return row || null;
}

export async function updateScanSessionStatus(sessionId, status) {
  const db = await getDb();
  const now = nowISO();
  await db.runAsync(
    `UPDATE scan_sessions SET status = ?, updated_at = ? WHERE id = ?`,
    [status, now, sessionId]
  );
  console.log('[scanSessions] Updated session', sessionId, '->', status);
}

export async function incrementSessionCounts(sessionId, fields) {
  const db = await getDb();
  const now = nowISO();
  const setClauses = [];
  const values = [];

  if (fields.total_cards != null) {
    setClauses.push('total_cards = total_cards + ?');
    values.push(fields.total_cards);
  }
  if (fields.processed_count != null) {
    setClauses.push('processed_count = processed_count + ?');
    values.push(fields.processed_count);
  }
  if (fields.failed_count != null) {
    setClauses.push('failed_count = failed_count + ?');
    values.push(fields.failed_count);
  }
  if (fields.last_processed_index != null) {
    setClauses.push('last_processed_index = ?');
    values.push(fields.last_processed_index);
  }

  if (!setClauses.length) return;

  setClauses.push('updated_at = ?');
  values.push(now);
  values.push(sessionId);

  await db.runAsync(
    `UPDATE scan_sessions SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  );
}

export async function setSessionCounts(sessionId, fields = {}) {
  const db = await getDb();
  const now = nowISO();
  const setClauses = [];
  const values = [];

  if (fields.total_cards != null) {
    setClauses.push('total_cards = ?');
    values.push(fields.total_cards);
  }
  if (fields.processed_count != null) {
    setClauses.push('processed_count = ?');
    values.push(fields.processed_count);
  }
  if (fields.failed_count != null) {
    setClauses.push('failed_count = ?');
    values.push(fields.failed_count);
  }
  if (fields.last_processed_index != null) {
    setClauses.push('last_processed_index = ?');
    values.push(fields.last_processed_index);
  }

  if (!setClauses.length) return;

  setClauses.push('updated_at = ?');
  values.push(now);
  values.push(sessionId);

  await db.runAsync(
    `UPDATE scan_sessions SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  );
}
