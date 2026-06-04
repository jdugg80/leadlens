import * as SQLite from 'expo-sqlite';
import { DB_NAME } from '../constants/scanStatuses';

let dbPromise = null;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}

export async function initScanDb() {
  const db = await getDb();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS scan_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      total_cards INTEGER DEFAULT 0,
      processed_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      last_processed_index INTEGER DEFAULT 0,
      source TEXT DEFAULT 'business_card_batch'
    );

    CREATE TABLE IF NOT EXISTS scan_cards (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      card_index INTEGER NOT NULL,
      original_image_uri TEXT,
      ocr_image_uri TEXT,
      status TEXT NOT NULL,
      raw_ocr_text TEXT,
      parsed_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scan_cards_session_id ON scan_cards(session_id);
    CREATE INDEX IF NOT EXISTS idx_scan_sessions_status ON scan_sessions(status);
  `);

  console.log('[scanDb] Database initialized');
  return db;
}
