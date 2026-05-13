import AsyncStorage from '@react-native-async-storage/async-storage';

// MMKV with AsyncStorage fallback.
// In production builds MMKV works and gives full speed benefit.
// In dev builds where native linking is unreliable, falls back to
// AsyncStorage silently — app never crashes due to MMKV unavailability.

let _storage = null;
let _fallback = false;

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

export const storageBridge = {
  getItem: async (key) => {
    try {
      const s = getStorage();
      if (s) {
        const v = s.getString(key);
        return v !== undefined ? v : null;
      }
    } catch { _fallback = true; _storage = null; }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key, value) => {
    try {
      const s = getStorage();
      if (s) { s.set(key, String(value)); return; }
    } catch { _fallback = true; _storage = null; }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    try {
      const s = getStorage();
      if (s) { s.delete(key); return; }
    } catch { _fallback = true; _storage = null; }
    return AsyncStorage.removeItem(key);
  },
  getAllKeys: async () => {
    try {
      const s = getStorage();
      if (s) return s.getAllKeys();
    } catch { _fallback = true; _storage = null; }
    return AsyncStorage.getAllKeys();
  },
};

export default storageBridge;
