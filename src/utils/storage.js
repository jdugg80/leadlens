import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Enhanced MMKV Storage Bridge
 * ────────────────────────────────────────────────────────────────
 * Provides BOTH synchronous and async APIs for maximum flexibility:
 * 
 * SYNC API (10-100x faster, no await needed):
 *   storage.getSync(key) — Get value immediately
 *   storage.setSync(key, value) — Set value immediately
 *   storage.removeSync(key) — Delete immediately
 *   storage.getAllKeysSync() — Get all keys immediately
 * 
 * ASYNC API (backward compatible with existing code):
 *   await storage.getItem(key) — Returns promise
 *   await storage.setItem(key, value) — Returns promise
 *   await storage.removeItem(key) — Returns promise
 *   await storage.getAllKeys() — Returns promise
 * 
 * JSON Helpers (automatically parse/stringify):
 *   storage.getJSON(key, fallback) — Parse JSON with fallback
 *   storage.setJSON(key, obj) — Stringify and store
 *   storage.getJSONSync(key, fallback) — Sync JSON parsing
 *   storage.setJSONSync(key, obj) — Sync JSON storing
 * 
 * Batch Operations (more efficient than individual calls):
 *   await storage.multiGet(keys) — Get multiple values at once
 *   await storage.multiSet(pairs) — Set multiple values at once
 *   await storage.multiRemove(keys) — Remove multiple keys at once
 */

let _storage = null;
let _fallback = false;
const _jsonCache = new Map(); // Simple cache for frequently accessed JSON

// ─── Cross-store consistency helpers ───────────────────────────────────────
// MMKV is fast but uses mmap; a hard kill can lose unflushed writes. We keep
// AsyncStorage as a durable mirror and use it as a fallback / tie-breaker.

function getLatestUpdatedAt(value) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      let latest = null;
      for (const item of parsed) {
        if (item && item.updatedAt && (!latest || item.updatedAt > latest)) {
          latest = item.updatedAt;
        }
      }
      return latest;
    }
    if (parsed && parsed.updatedAt) return parsed.updatedAt;
  } catch {
    // Not JSON
  }
  return null;
}

// Choose the more durable/recent value when MMKV and AsyncStorage differ.
function reconcileValues(mmkvValue, asyncValue) {
  // Only one source has data → use it
  if (asyncValue === null || asyncValue === undefined) return mmkvValue;
  if (mmkvValue === null || mmkvValue === undefined) return asyncValue;

  // Identical → either is fine
  if (mmkvValue === asyncValue) return mmkvValue;

  // Compare updatedAt timestamps for arrays/objects
  const mmkvLatest = getLatestUpdatedAt(mmkvValue);
  const asyncLatest = getLatestUpdatedAt(asyncValue);
  if (mmkvLatest && asyncLatest) {
    return asyncLatest > mmkvLatest ? asyncValue : mmkvValue;
  }

  // Cannot determine recency: prefer AsyncStorage for durability. This is
  // conservative; if MMKV lost data on force-close, AsyncStorage is the backup.
  return asyncValue;
}

function getStorage() {
  if (_fallback) return null;
  if (_storage) return _storage;
  try {
    const { MMKV } = require('react-native-mmkv');
    _storage = new MMKV({ id: 'leadlens-storage' });
    return _storage;
  } catch {
    _fallback = true;
    return null;
  }
}

// ─── SYNCHRONOUS API (No await needed!) ───────────────────────────────────
export const storage = {
  /**
   * Get a value synchronously. Use this in performance-critical paths.
   * NOTE: When MMKV is unavailable, sync reads cannot reach AsyncStorage (async-only).
   * For critical flags (tutorial seen, auth), use getItem() instead.
   * @param {string} key
   * @returns {string | null} The stored value or null
   */
  getSync: (key) => {
    try {
      const s = getStorage();
      if (s) {
        const v = s.getString(key);
        const isLeadLock = key === '@leadlens_leads';
        if (isLeadLock && v) {
          try {
            const parsed = JSON.parse(v);
            console.log(`[Storage] getSync LeadLock queue read. Length: ${Array.isArray(parsed) ? parsed.length : 'N/A'}`);
          } catch {
            console.warn('[Storage] getSync LeadLock queue read failed to parse');
          }
        }
        return v !== undefined ? v : null;
      }
    } catch (err) {
      console.warn(`[Storage] getSync error for key "${key}":`, err.message);
      _fallback = true;
      _storage = null;
    }
    return null; // Sync fallback: cannot call AsyncStorage synchronously
  },

  /**
   * Set a value synchronously. Writes to MMKV immediately and also schedules
   * an AsyncStorage mirror write for durability. If MMKV is unavailable, only
   * the AsyncStorage write is attempted.
   * @param {string} key
   * @param {string} value
   */
  setSync: (key, value) => {
    const strValue = String(value);
    try {
      const s = getStorage();
      if (s) {
        s.set(key, strValue);
      }
    } catch (err) {
      console.warn(`[Storage] setSync error for key "${key}":`, err.message);
      _fallback = true;
      _storage = null;
    }
    // Always mirror to AsyncStorage for durability. Fire-and-forget keeps the
    // sync API non-blocking; use setItem() if you need to await the mirror.
    AsyncStorage.setItem(key, strValue).catch((e) =>
      console.warn(`[Storage] setSync AsyncStorage mirror error for "${key}":`, e.message)
    );

    if (key === '@leadlens_leads') {
      try {
        const parsed = JSON.parse(strValue);
        const last = Array.isArray(parsed) && parsed.length > 0 ? parsed[parsed.length - 1] : null;
        console.log(`[Storage] setSync LeadLock queue written. Length: ${Array.isArray(parsed) ? parsed.length : 'N/A'}`, last ? `Last address: ${last.address ?? 'NO_ADDRESS'} | keys: ${Object.keys(last).join(',')}` : '');
      } catch {
        console.warn('[Storage] setSync LeadLock queue written but could not parse length');
      }
    }
  },

  /**
   * Remove a value synchronously.
   * Falls back to AsyncStorage remove when MMKV is unavailable.
   * @param {string} key
   */
  removeSync: (key) => {
    try {
      const s = getStorage();
      if (s) {
        s.delete(key);
      }
    } catch (err) {
      console.warn(`[Storage] removeSync error for key "${key}":`, err.message);
      _fallback = true;
      _storage = null;
    }
    // Always mirror removal to AsyncStorage
    AsyncStorage.removeItem(key).catch((e) =>
      console.warn(`[Storage] removeSync AsyncStorage mirror error for "${key}":`, e.message)
    );
  },

  /**
   * Get all keys synchronously.
   * @returns {string[]} Array of all keys
   */
  getAllKeysSync: () => {
    try {
      const s = getStorage();
      if (s) return s.getAllKeys();
    } catch (err) {
      console.warn('[Storage] getAllKeysSync error:', err.message);
      _fallback = true;
      _storage = null;
    }
    return [];
  },

  /**
   * Get JSON value synchronously. Parses with fallback.
   * @param {string} key
   * @param {*} fallback Value to return if not found or parse fails
   * @returns {*} Parsed value or fallback
   */
  getJSONSync: (key, fallback = null) => {
    try {
      const raw = storage.getSync(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[Storage] getJSONSync parse error for key "${key}":`, err.message);
      return fallback;
    }
  },

  /**
   * Set JSON value synchronously. Automatically stringifies and mirrors to
   * AsyncStorage for durability.
   * @param {string} key
   * @param {*} obj Object to stringify and store
   */
  setJSONSync: (key, obj) => {
    try {
      const json = JSON.stringify(obj);
      storage.setSync(key, json);
      _jsonCache.set(key, obj);
    } catch (err) {
      console.warn(`[Storage] setJSONSync error for key "${key}":`, err.message);
    }
  },

  // ─── ASYNC API (Backward compatible) ───────────────────────────────────
  /**
   * Get a value asynchronously. Reads from MMKV first, then from AsyncStorage,
   * and returns the more recent/durable value. This protects against MMKV
   * losing unflushed mmap data when the app is force-killed.
   * @param {string} key
   * @returns {Promise<string | null>}
   */
  getItem: async (key) => {
    const mmkvVal = storage.getSync(key);
    try {
      const asyncVal = await AsyncStorage.getItem(key);
      return reconcileValues(mmkvVal, asyncVal);
    } catch {
      return mmkvVal;
    }
  },

  /**
   * Set a value asynchronously. Writes to MMKV and awaits the AsyncStorage
   * mirror so callers can be sure the durable backup is committed.
   * @param {string} key
   * @param {string} value
   * @returns {Promise<void>}
   */
  setItem: async (key, value) => {
    const strValue = String(value);
    try {
      const s = getStorage();
      if (s) {
        s.set(key, strValue);
      }
    } catch (err) {
      console.warn(`[Storage] setItem MMKV error for "${key}":`, err.message);
      _fallback = true;
      _storage = null;
    }
    try {
      await AsyncStorage.setItem(key, strValue);
    } catch (e) {
      console.warn(`[Storage] setItem AsyncStorage mirror error for "${key}":`, e.message);
    }
  },

  /**
   * Remove a value asynchronously. Wrapper around removeSync for compatibility.
   * @param {string} key
   * @returns {Promise<void>}
   */
  removeItem: async (key) => {
    return storage.removeSync(key);
  },

  /**
   * Get all keys asynchronously.
   * @returns {Promise<string[]>}
   */
  getAllKeys: async () => {
    return storage.getAllKeysSync();
  },

  /**
   * Get JSON value asynchronously with fallback. Uses the reconciled getItem
   * so it benefits from the AsyncStorage mirror.
   * @param {string} key
   * @param {*} fallback
   * @returns {Promise<*>}
   */
  getJSON: async (key, fallback = null) => {
    try {
      const raw = await storage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  /**
   * Set JSON value asynchronously. Mirrors to both MMKV and AsyncStorage.
   * @param {string} key
   * @param {*} obj
   * @returns {Promise<void>}
   */
  setJSON: async (key, obj) => {
    const json = JSON.stringify(obj);
    try {
      const s = getStorage();
      if (s) {
        s.set(key, json);
      }
    } catch (err) {
      console.warn(`[Storage] setJSON MMKV error for "${key}":`, err.message);
      _fallback = true;
      _storage = null;
    }
    try {
      await AsyncStorage.setItem(key, json);
      _jsonCache.set(key, obj);
    } catch (e) {
      console.warn(`[Storage] setJSON AsyncStorage mirror error for "${key}":`, e.message);
    }
  },

  // ─── BATCH OPERATIONS (More efficient) ───────────────────────────────────
  /**
   * Get multiple values in one operation.
   * @param {string[]} keys
   * @returns {Promise<string[]>} Array of values in same order as keys
   */
  multiGet: async (keys) => {
    return keys.map(key => storage.getSync(key));
  },

  /**
   * Set multiple key-value pairs in one operation.
   * @param {Array<[string, string]>} pairs Array of [key, value] tuples
   * @returns {Promise<void>}
   */
  multiSet: async (pairs) => {
    for (const [key, value] of pairs) {
      storage.setSync(key, value);
    }
  },

  /**
   * Remove multiple keys in one operation.
   * @param {string[]} keys
   * @returns {Promise<void>}
   */
  multiRemove: async (keys) => {
    for (const key of keys) {
      storage.removeSync(key);
    }
  },

  /**
   * Multi-tenancy helper: returns a key prefixed with user ID
   * @param {string} baseKey
   * @returns {string} Prefixed key
   */
  getUserKey: (baseKey) => {
    try {
      const authProfile = storage.getSync('@leadlens_auth_profile');
      if (authProfile) {
        const { email } = JSON.parse(authProfile);
        if (email) return `${baseKey}_${email.toLowerCase().trim()}`;
      }
    } catch (err) {
      console.warn('[Storage] getUserKey failed:', err.message);
    }
    return baseKey;
  },

  /**
   * Get user-prefixed key synchronously
   * @param {string} baseKey
   * @returns {Promise<string>}
   */
  getUserKeyAsync: async (baseKey) => {
    return storage.getUserKey(baseKey);
  },

  /**
   * Clear the entire storage (use with caution!)
   */
  clear: async () => {
    try {
      const s = getStorage();
      if (s) {
        s.clearAll();
        _jsonCache.clear();
        return;
      }
    } catch (err) {
      console.error('[Storage] clear error:', err.message);
      _fallback = true;
      _storage = null;
    }
  },

  /**
   * Get MMKV instance directly for advanced operations
   */
  getInstance: () => getStorage(),
};

// Export both named and default for backward compatibility
export const storageBridge = storage;
export default storage;
