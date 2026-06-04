import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { storage as AsyncStorage } from './storage';

export const BACKGROUND_OPTIMIZATION_PROMPTED_KEY = '@leadlens_bg_opt_prompted_v1';
export const LAST_ACTIVE_AT_KEY = '@leadlens_last_active_at';
export const LAST_ACTIVE_ROUTE_KEY = '@leadlens_last_active_route';

export const WORKDAY_PERSIST_MS = 12 * 60 * 60 * 1000;

const RESTORABLE_ROUTE_NAMES = new Set([
  'Dashboard',
  'CardGallery',
  ]);

export function isRestorableRoute(routeName) {
  return RESTORABLE_ROUTE_NAMES.has(String(routeName || ''));
}

export function hasPromptedBackgroundOptimization() {
  return AsyncStorage.getSync(BACKGROUND_OPTIMIZATION_PROMPTED_KEY) === 'true';
}

export function markBackgroundOptimizationPrompted() {
  AsyncStorage.setSync(BACKGROUND_OPTIMIZATION_PROMPTED_KEY, 'true');
}

export function shouldPromptBackgroundOptimization() {
  if (Platform.OS !== 'android') return false;
  return !hasPromptedBackgroundOptimization();
}

export function recordLastActiveAt(timestamp = Date.now()) {
  AsyncStorage.setSync(LAST_ACTIVE_AT_KEY, String(Number(timestamp) || Date.now()));
}

export function recordLastActiveRoute(routeName) {
  if (!isRestorableRoute(routeName)) return;
  AsyncStorage.setSync(LAST_ACTIVE_ROUTE_KEY, String(routeName));
}

export function getWarmRestoreRoute() {
  const routeName = AsyncStorage.getSync(LAST_ACTIVE_ROUTE_KEY);
  if (!isRestorableRoute(routeName)) return null;

  const lastActiveAt = Number(AsyncStorage.getSync(LAST_ACTIVE_AT_KEY) || 0);
  if (!Number.isFinite(lastActiveAt) || lastActiveAt <= 0) return null;

  const age = Date.now() - lastActiveAt;
  if (age < 0 || age > WORKDAY_PERSIST_MS) return null;
  return routeName;
}

export async function openBatteryOptimizationSettings() {
  if (Platform.OS !== 'android') return false;

  const packageName = Constants.expoConfig?.android?.package || '';

  const intents = [
    {
      action: 'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      extras: packageName
        ? [{ key: 'package', value: `package:${packageName}` }]
        : [],
    },
    {
      action: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
      extras: [],
    },
  ];

  if (typeof Linking.sendIntent === 'function') {
    for (const intent of intents) {
      try {
        await Linking.sendIntent(intent.action, intent.extras);
        return true;
      } catch {
        // Try next intent fallback
      }
    }
  }

  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}


