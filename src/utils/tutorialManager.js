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
    await AsyncStorage.setItem(PREFIX + tutorialId, 'true');
  } catch (err) {
    console.warn('[TutorialManager] Failed to mark tutorial seen:', tutorialId, err?.message || String(err));
  }
}

export async function resetAllTutorials() {
  try {
    const keys = AsyncStorage.getAllKeysSync().filter(k => k.startsWith(PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch (err) {
    console.warn('[TutorialManager] Failed to reset tutorials:', err?.message || String(err));
  }
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
