import { storageBridge as AsyncStorage } from './storage';
import { Audio } from 'expo-av';

const SOUND_EFFECTS_ENABLED_KEY = '@leadlens_sounds_enabled';
const DAILY_GOAL_CHIME_ENABLED_KEY = '@leadlens_daily_goal_chime_enabled';
const EXPORT_SOUNDS_ENABLED_KEY = '@leadlens_export_sounds_enabled';

export type SoundName =
  | 'prospect-added'
  | 'export-created'
  | 'export-sent'
  | 'daily-goal-met'
  | 'error'
  | 'generic';

const SOUND_FILES: Record<SoundName, any> = {
  'prospect-added': require('../../assets/sounds/prospect-added.mp3'),
  'export-created': require('../../assets/sounds/export-created.mp3'),
  'export-sent': require('../../assets/sounds/export-sent.mp3'),
  'daily-goal-met': require('../../assets/sounds/daily-goal-met.mp3'),
  error: require('../../assets/sounds/error.mp3'),
  generic: require('../../assets/sounds/ding.mp3'),
};

let _soundEffectsEnabled = true;
let _dailyGoalChimeEnabled = true;
let _exportSoundsEnabled = true;
const _loadedSounds: Partial<Record<SoundName, Audio.Sound>> = {};
const _loadingSounds: Partial<Record<SoundName, Promise<Audio.Sound | null>>> = {};

async function loadBooleanSetting(key: string, defaultValue: boolean) {
  try {
    const saved = await AsyncStorage.getItem(key);
    return saved === null ? defaultValue : saved === 'true';
  } catch {
    return defaultValue;
  }
}

async function saveBooleanSetting(key: string, value: boolean) {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {
    // ignore storage failures
  }
}

export async function loadSoundSettings() {
  _soundEffectsEnabled = await loadBooleanSetting(SOUND_EFFECTS_ENABLED_KEY, true);
  return _soundEffectsEnabled;
}

export async function loadDailyGoalChimeSettings() {
  _dailyGoalChimeEnabled = await loadBooleanSetting(DAILY_GOAL_CHIME_ENABLED_KEY, true);
  return _dailyGoalChimeEnabled;
}

export async function loadExportSoundSettings() {
  _exportSoundsEnabled = await loadBooleanSetting(EXPORT_SOUNDS_ENABLED_KEY, true);
  return _exportSoundsEnabled;
}

export async function setSoundsEnabled(enabled: boolean) {
  _soundEffectsEnabled = enabled;
  await saveBooleanSetting(SOUND_EFFECTS_ENABLED_KEY, enabled);
}

export async function setDailyGoalChimeEnabled(enabled: boolean) {
  _dailyGoalChimeEnabled = enabled;
  await saveBooleanSetting(DAILY_GOAL_CHIME_ENABLED_KEY, enabled);
}

export async function setExportSoundsEnabled(enabled: boolean) {
  _exportSoundsEnabled = enabled;
  await saveBooleanSetting(EXPORT_SOUNDS_ENABLED_KEY, enabled);
}

export function getSoundsEnabled() {
  return _soundEffectsEnabled;
}

export function getDailyGoalChimeEnabled() {
  return _dailyGoalChimeEnabled;
}

export function getExportSoundsEnabled() {
  return _exportSoundsEnabled;
}

async function ensureSoundLoaded(soundName: SoundName) {
  if (_loadedSounds[soundName]) return _loadedSounds[soundName];
  if (_loadingSounds[soundName]) return _loadingSounds[soundName];

  _loadingSounds[soundName] = (async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(SOUND_FILES[soundName], { shouldPlay: false });
      _loadedSounds[soundName] = sound;
      return sound;
    } catch {
      _loadedSounds[soundName] = null;
      return null;
    } finally {
      delete _loadingSounds[soundName];
    }
  })();

  return _loadingSounds[soundName];
}

async function playLoadedSound(soundName: SoundName) {
  const sound = await ensureSoundLoaded(soundName);
  if (!sound) return;

  try {
    await sound.replayAsync();
  } catch {
    try {
      await sound.unloadAsync();
    } catch {
      // ignore unload error
    }
    delete _loadedSounds[soundName];
    const freshSound = await ensureSoundLoaded(soundName);
    if (freshSound) {
      await freshSound.replayAsync();
    }
  }
}

export async function preloadSoundEffects() {
  await Promise.all([
    loadSoundSettings(),
    loadDailyGoalChimeSettings(),
    loadExportSoundSettings(),
  ]);
}

export async function playSoundEffect(soundName: SoundName) {
  if (soundName === 'daily-goal-met') {
    if (!_soundEffectsEnabled || !_dailyGoalChimeEnabled) return;
  } else if (soundName === 'export-created' || soundName === 'export-sent') {
    if (!_soundEffectsEnabled || !_exportSoundsEnabled) return;
  } else {
    if (!_soundEffectsEnabled) return;
  }

  await playLoadedSound(soundName);
}

export async function playGenericSound() {
  if (!_soundEffectsEnabled) return;
  await playLoadedSound('generic');
}

export async function unloadSoundEffects() {
  await Promise.all(
    Object.values(_loadedSounds).map(async (sound) => {
      if (!sound) return;
      try {
        await sound.unloadAsync();
      } catch {
        // ignore
      }
    })
  );
  Object.keys(_loadedSounds).forEach((key) => {
    delete _loadedSounds[key as SoundName];
  });
}
