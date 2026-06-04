import { getDb } from './scanDb';
import { SCAN_CARD_STATUS } from '../constants/scanStatuses';

function generateCardId() {
  return `card_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function nowISO() {
  return new Date().toISOString();
}

export async function createScanCard({ sessionId, cardIndex, originalImageUri, ocrImageUri, status }) {
  const db = await getDb();
  const id = generateCardId();
  const now = nowISO();

  await db.runAsync(
    `INSERT INTO scan_cards (id, session_id, card_index, original_image_uri, ocr_image_uri, status, raw_ocr_text, parsed_json, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    [
      id,
      sessionId,
      cardIndex,
      originalImageUri || null,
      ocrImageUri || null,
      status || SCAN_CARD_STATUS.CAPTURED,
      now,
      now,
    ]
  );

  console.log('[scanCards] Created card:', id, 'for session:', sessionId);
  return id;
}

export async function updateScanCardStatus(cardId, status) {
  const db = await getDb();
  const now = nowISO();
  await db.runAsync(
    `UPDATE scan_cards SET status = ?, updated_at = ? WHERE id = ?`,
    [status, now, cardId]
  );
}

export async function updateScanCardResult(cardId, result) {
  const db = await getDb();
  const now = nowISO();
  const { status, rawOcrText, parsedJson, errorMessage } = result || {};

  await db.runAsync(
    `UPDATE scan_cards SET status = ?, raw_ocr_text = ?, parsed_json = ?, error_message = ?, updated_at = ? WHERE id = ?`,
    [
      status || SCAN_CARD_STATUS.COMPLETED,
      rawOcrText || null,
      parsedJson ? JSON.stringify(parsedJson) : null,
      errorMessage || null,
      now,
      cardId,
    ]
  );
}

export async function updateScanCardFields(cardId, fields = {}) {
  const db = await getDb();
  const now = nowISO();
  const setClauses = [];
  const values = [];

  if (fields.status != null) {
    setClauses.push('status = ?');
    values.push(fields.status);
  }
  if (fields.raw_ocr_text !== undefined) {
    setClauses.push('raw_ocr_text = ?');
    values.push(fields.raw_ocr_text || null);
  }
  if (fields.parsed_json !== undefined) {
    setClauses.push('parsed_json = ?');
    if (fields.parsed_json == null) {
      values.push(null);
    } else if (typeof fields.parsed_json === 'string') {
      values.push(fields.parsed_json);
    } else {
      values.push(JSON.stringify(fields.parsed_json));
    }
  }
  if (fields.error_message !== undefined) {
    setClauses.push('error_message = ?');
    values.push(fields.error_message || null);
  }
  if (fields.ocr_image_uri !== undefined) {
    setClauses.push('ocr_image_uri = ?');
    values.push(fields.ocr_image_uri || null);
  }

  if (!setClauses.length) return;

  setClauses.push('updated_at = ?');
  values.push(now);
  values.push(cardId);

  await db.runAsync(
    `UPDATE scan_cards SET ${setClauses.join(', ')} WHERE id = ?`,
    values
  );
}

export async function getCardsForSession(sessionId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM scan_cards WHERE session_id = ? ORDER BY card_index ASC`,
    [sessionId]
  );
  return rows;
}

export async function getPendingCardsForSession(sessionId) {
  return getQueueCardsForSession(sessionId, { includeFailed: true });
}

export async function getQueueCardsForSession(sessionId, options = {}) {
  const includeFailed = !!options.includeFailed;
  const statuses = [SCAN_CARD_STATUS.CAPTURED, SCAN_CARD_STATUS.OCR_PENDING];
  if (includeFailed) {
    statuses.push(SCAN_CARD_STATUS.FAILED);
  }

  const placeholders = statuses.map(() => '?').join(', ');
  const values = [sessionId, ...statuses];
  let limitClause = '';
  if (Number.isFinite(options.limit) && options.limit > 0) {
    limitClause = ` LIMIT ${Math.floor(options.limit)}`;
  }

  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM scan_cards WHERE session_id = ? AND status IN (${placeholders}) ORDER BY card_index ASC${limitClause}`,
    values
  );
  return rows;
}

export async function getCompletedCardsForSession(sessionId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM scan_cards WHERE session_id = ? AND status IN (?, ?, ?, ?, ?, ?, ?) ORDER BY card_index ASC`,
    [
      sessionId,
      SCAN_CARD_STATUS.READY_FOR_REVIEW,
      SCAN_CARD_STATUS.PARSE_COMPLETE,
      SCAN_CARD_STATUS.NEEDS_REVIEW,
      SCAN_CARD_STATUS.ENRICHMENT_PENDING,
      SCAN_CARD_STATUS.ENRICHED,
      SCAN_CARD_STATUS.FAILED_ENRICHMENT,
      SCAN_CARD_STATUS.COMPLETED,
      SCAN_CARD_STATUS.OCR_COMPLETE,
    ]
  );
  return rows;
}

export async function getEnrichmentQueueCardsForSession(sessionId) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM scan_cards WHERE session_id = ? AND status IN (?, ?, ?) ORDER BY card_index ASC`,
    [
      sessionId,
      SCAN_CARD_STATUS.READY_FOR_REVIEW,
      SCAN_CARD_STATUS.NEEDS_REVIEW,
      SCAN_CARD_STATUS.FAILED_ENRICHMENT,
    ]
  );
  return rows;
}
