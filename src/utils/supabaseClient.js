import 'react-native-url-polyfill/auto';
import { storage as AsyncStorage } from './storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

let cachedKey = '';
let cachedClient = null;
let appStateSubscription = null;

const storageAdapter = {
  getItem: (key) => AsyncStorage.getSync(key),
  setItem: (key, value) => AsyncStorage.setSync(key, value),
  removeItem: (key) => AsyncStorage.removeSync(key),
};

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function createSupabaseClient(settings = {}) {
  /*
    Prefer in-app Settings first.
    This keeps the app pointed at the project the user configured in UI,
    while still allowing env fallback when Settings are empty.
  */
  const envUrl = clean(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const envAnonKey = clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const settingsUrl = clean(settings?.supabaseUrl);
  const settingsAnonKey = clean(settings?.supabaseAnonKey);

  const url = settingsUrl || envUrl;
  const anonKey = settingsAnonKey || envAnonKey;

  if (!url || !anonKey) {
    console.warn('[Supabase] Missing Supabase URL or anon key.', {
      hasEnvUrl: !!envUrl,
      hasEnvAnonKey: !!envAnonKey,
      hasSettingsUrl: !!settingsUrl,
      hasSettingsAnonKey: !!settingsAnonKey,
    });

    return null;
  }

  const cacheKey = `${url}|${anonKey}`;

  if (cachedClient && cachedKey === cacheKey) {
    return cachedClient;
  }

  let client;
  try {
    client = createClient(url, anonKey, {
      auth: {
        storage: storageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  } catch (err) {
    console.warn('[Supabase] Could not create Supabase client.', {
      message: err?.message || String(err),
      hasUrl: !!url,
      hasAnonKey: !!anonKey,
    });
    return null;
  }

  if (
    typeof client?.auth?.startAutoRefresh === 'function' &&
    typeof client?.auth?.stopAutoRefresh === 'function'
  ) {
    if (appStateSubscription?.remove) {
      appStateSubscription.remove();
    }

    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        client.auth.startAutoRefresh();
      } else {
        client.auth.stopAutoRefresh();
      }
    });
  }

  cachedKey = cacheKey;
  cachedClient = client;

  return client;
}