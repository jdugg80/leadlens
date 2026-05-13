import { storageBridge as AsyncStorage } from './storage';

const PREFIX = '@leadlens_tutorial_seen_';

export async function hasTutorialBeenSeen(tutorialId) {
  try {
    const val = await AsyncStorage.getItem(PREFIX + tutorialId);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function markTutorialSeen(tutorialId) {
  try {
    await AsyncStorage.setItem(PREFIX + tutorialId, 'true');
  } catch {}
}

export async function resetAllTutorials() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const tutorialKeys = keys.filter(k => k.startsWith(PREFIX));
    if (tutorialKeys.length) await AsyncStorage.multiRemove(tutorialKeys);
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
