import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

let cachedKey = '';
let cachedClient = null;

const storageAdapter = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

export function createSupabaseClient(settings = {}) {
  const url = settings?.supabaseUrl?.trim();
  const anonKey = settings?.supabaseAnonKey?.trim();

  if (!url || !anonKey) return null;

  const cacheKey = `${url}|${anonKey}`;
  if (cachedClient && cachedKey === cacheKey) return cachedClient;

  const client = createClient(url, anonKey, {
    auth: {
      storage: storageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  if (typeof client?.auth?.startAutoRefresh === 'function' && typeof client?.auth?.stopAutoRefresh === 'function') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }

  cachedKey = cacheKey;
  cachedClient = client;
  return client;
}
