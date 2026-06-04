import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const pushTokenRlsWarnedUsers = new Set();

// ─── Call this once from App.js root, not at module level ────────────────────
export function configurePushNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  true,
    }),
  });
}

// ─── Register device and save token to Supabase ───────────────────────────────
export async function registerPushToken(userId) {
  try {
    if (!Device.isDevice) return null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('signals', {
        name:             'LeadLens Signals',
        importance:       Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor:       '#00C9FF',
        sound:            'default',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    if (!token || !userId) return null;

    const { error } = await supabase
      .from('user_push_tokens')
      .upsert(
        {
          user_id:     userId,
          push_token:  token,
          device_info: {
            platform:      Platform.OS,
            brand:         Device.brand,
            modelName:     Device.modelName,
            osVersion:     Device.osVersion,
            registered_at: new Date().toISOString(),
          },
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      const message = String(error.message || '');
      const isRls = /row-level security/i.test(message);
      if (isRls) {
        if (!pushTokenRlsWarnedUsers.has(String(userId))) {
          pushTokenRlsWarnedUsers.add(String(userId));
          console.warn('[Push] Token save skipped by RLS policy for this user.');
        }
      } else {
        console.warn('[Push] Token save failed:', message);
      }
    }
    return token;
  } catch (err) {
    console.warn('[Push] Registration error:', err.message);
    return null;
  }
}

// ─── Remove token on logout ───────────────────────────────────────────────────
export async function unregisterPushToken(userId) {
  try {
    if (!userId) return;
    await supabase.from('user_push_tokens').delete().eq('user_id', userId);
  } catch (err) {
    console.warn('[Push] Unregister error:', err.message);
  }
}

// ─── Foreground notification listeners ───────────────────────────────────────
export function addForegroundNotificationListener(onReceive) {
  return Notifications.addNotificationReceivedListener(onReceive);
}

export function removeForegroundNotificationListener(subscription) {
  Notifications.removeNotificationSubscription(subscription);
}
