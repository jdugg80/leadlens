import { storage as AsyncStorage } from './storage';

const PREFIX = '@leadlens_tutorial_seen_';

export async function hasTutorialBeenSeen(tutorialId) {
  try {
    // Try MMKV first (sync, fast)
    const syncVal = AsyncStorage.getSync(PREFIX + tutorialId);
    if (syncVal === 'true') return true;
    // Fall back to async read — covers sessions where MMKV was down
    // and the flag was written via AsyncStorage fallback
    const asyncVal = await AsyncStorage.getItem(PREFIX + tutorialId);
    return asyncVal === 'true';
  } catch {
    return false;
  }
}

export async function markTutorialSeen(tutorialId) {
  try {
    // Write to MMKV synchronously
    AsyncStorage.setSync(PREFIX + tutorialId, 'true');
  } catch {}
  try {
    // Also write directly to raw AsyncStorage and AWAIT it —
    // this guarantees the flag is persisted before the caller returns,
    // preventing the race where hasTutorialBeenSeen reads before the write lands.
    const RawStorage = require('@react-native-async-storage/async-storage').default;
    await RawStorage.setItem(PREFIX + tutorialId, 'true');
  } catch {}
}

export async function resetAllTutorials() {
  try {
    // Clear from MMKV
    const keys = AsyncStorage.getAllKeysSync();
    const tutorialKeys = keys.filter(k => k.startsWith(PREFIX));
    if (tutorialKeys.length) AsyncStorage.multiRemove(tutorialKeys);
  } catch {}
  try {
    // Also clear from raw AsyncStorage (covers fallback-written flags)
    const RawStorage = require('@react-native-async-storage/async-storage').default;
    const allKeys = await RawStorage.getAllKeys();
    const tutorialKeys = allKeys.filter(k => k.startsWith(PREFIX));
    if (tutorialKeys.length) await RawStorage.multiRemove(tutorialKeys);
  } catch {}
}

// Tutorial IDs
export const TUTORIALS = {
  SCAN:       'scan',
  MANUAL:     'manual',
  TERRITORY:  'territory',
  EXPORT:     'export',
  GALLERY:    'gallery',
  SETTINGS:   'settings',
  QUEUE:      'queue',
};
