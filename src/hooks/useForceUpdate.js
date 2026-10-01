// src/hooks/useForceUpdate.js
//
// Reads force_update from Project Scarlett's app_config (pass the SCARLETT client,
// never the LeadLens one). Blocks the app when this build's versionCode is below
// min_version_code.
//
// Safety rules built in:
//  - Never blocks in __DEV__ (dev client stays usable)
//  - Fails open on any network/config error
//  - Fails open if the current versionCode cannot be read (0), so a misread can
//    never lock every tester out

import { useCallback, useEffect, useState } from 'react';
import { AppState, View, Text, Pressable, Linking, StatusBar } from 'react-native';
import Constants from 'expo-constants';

export const CURRENT_VERSION_CODE = Number(
  Constants.expoConfig?.android?.versionCode ?? 0
);

export function useForceUpdate(scarlett) {
  const [required, setRequired] = useState(null);

  const check = useCallback(async () => {
    if (__DEV__ || !scarlett || !CURRENT_VERSION_CODE) return;
    try {
      const { data, error } = await scarlett
        .from('app_config')
        .select('value')
        .eq('key', 'force_update')
        .single();
      if (error || !data?.value) return;

      const min = Number(data.value.min_version_code) || 0;
      const apkUrl = data.value.apk_url || '';
      setRequired(CURRENT_VERSION_CODE < min ? { apk_url: apkUrl } : null);
    } catch {
      // fail open
    }
  }, [scarlett]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  return required;
}

// Full-screen component, deliberately NOT a Modal.
export function ForceUpdateScreen({ cfg }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#080A0F',
        justifyContent: 'center',
        padding: 24,
        paddingTop: (StatusBar.currentHeight ?? 0) + 24,
      }}
    >
      <Text style={{ color: '#B8BDD0', fontSize: 18, marginBottom: 16 }}>
        A required update is available. Please install the latest beta to continue.
      </Text>
      <Pressable
        onPress={() => cfg?.apk_url && Linking.openURL(cfg.apk_url)}
        style={{ backgroundColor: '#00C9FF', padding: 14, borderRadius: 8 }}
      >
        <Text style={{ textAlign: 'center', fontWeight: '600' }}>Update now</Text>
      </Pressable>
    </View>
  );
}
