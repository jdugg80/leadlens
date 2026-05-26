import { storage as AsyncStorage } from './storage';

const PREFIX = '@leadlens_tutorial_seen_';

export async function hasTutorialBeenSeen(tutorialId) {
  try {
    const val = AsyncStorage.getSync(PREFIX + tutorialId);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function markTutorialSeen(tutorialId) {
  try {
    AsyncStorage.setSync(PREFIX + tutorialId, 'true');
  } catch {}
}

export async function resetAllTutorials() {
  try {
    const keys = AsyncStorage.getAllKeysSync();
    const tutorialKeys = keys.filter(k => k.startsWith(PREFIX));
    if (tutorialKeys.length) AsyncStorage.multiRemove(tutorialKeys);
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
