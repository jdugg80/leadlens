import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

/**
 * Requests notification permissions and registers the Expo Push Token to Supabase.
 * This is the first step for enabling proximity and compliance alerts via LensSignal.
 */
export const registerLensSignalPushToken = async () => {
  try {
    // 1. Confirm device is physical using expo-device
    if (!Device.isDevice) {
      console.warn('[registerPushToken] Must use physical device for push notifications');
      return { error: 'Emulator/Simulator not supported for push' };
    }

    // 2. Get authenticated Supabase user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[registerPushToken] No authenticated user found');
      return { error: 'Not authenticated' };
    }

    // 3. Request notification permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('[registerPushToken] Failed to get push token for push notification!');
      return { error: 'Permission not granted' };
    }

    // 4. Get Expo push token
    // We need the Project ID from expo constants for EAS builds
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.warn('[registerPushToken] Project ID not found in constants. Ensure EAS is configured.');
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;

    // 5. Save/upsert into user_push_tokens
    const { error: upsertError } = await supabase
      .from('user_push_tokens')
      .upsert({
        user_id: user.id,
        push_token: token,
        platform: Platform.OS,
        device_name: Device.modelName || 'Unknown Device',
        enabled: true,
        updated_at: new Date().toISOString(),
        device_info: {
          brand: Device.brand,
          osVersion: Device.osVersion,
          designName: Device.designName,
          deviceName: Device.deviceName
        }
      }, {
        onConflict: 'user_id, push_token'
      });

    if (upsertError) {
      console.error('[registerPushToken] Upsert failed:', upsertError);
      return { error: upsertError.message };
    }

    // Configure notification behavior for when the app is foregrounded
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    return { success: true, token };
  } catch (err) {
    console.error('[registerPushToken] Unexpected error:', err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
};
