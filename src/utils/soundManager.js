import {
  getSoundsEnabled,
  getDailyGoalChimeEnabled,
  loadSoundSettings,
  loadDailyGoalChimeSettings,
  setSoundsEnabled,
  setDailyGoalChimeEnabled,
  loadExportSoundSettings,
  getExportSoundsEnabled,
  setExportSoundsEnabled,
  preloadSoundEffects,
  playSoundEffect,
} from './soundEffects';

export {
  getSoundsEnabled,
  getDailyGoalChimeEnabled,
  loadSoundSettings,
  loadDailyGoalChimeSettings,
  setSoundsEnabled,
  setDailyGoalChimeEnabled,
  loadExportSoundSettings,
  getExportSoundsEnabled,
  setExportSoundsEnabled,
  preloadSoundEffects,
  playSoundEffect,
};

export async function playSubmitChime() {
  await playSoundEffect('generic');
}

export async function playCaptureSound() {
  await playSoundEffect('generic');
}

export async function playErrorSound() {
  await playSoundEffect('error');
}

export async function playSuccessSound() {
  await playSoundEffect('generic');
}
