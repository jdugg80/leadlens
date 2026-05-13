import * as Camera from 'expo-camera';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { storageBridge as AsyncStorage } from './storage';
import { Platform, PermissionsAndroid } from 'react-native';

const PERMISSIONS_CHECKED_KEY = '@leadlens_permissions_setup_v1';

/**
 * Checks if we have already prompted the user for the "bulk" permission grant.
 */
export async function hasRequestedBulkPermissions() {
  const val = await AsyncStorage.getItem(PERMISSIONS_CHECKED_KEY);
  return val === 'true';
}

/**
 * Marks that we have attempted the bulk permission grant.
 */
export async function markBulkPermissionsRequested() {
  await AsyncStorage.setItem(PERMISSIONS_CHECKED_KEY, 'true');
}

/**
 * Requests all core LeadLens permissions in sequence.
 */
export async function requestAllPermissions() {
  console.log('[PermissionManager] Starting bulk permission request...');

  try {
    // 1. Camera (Main scanner & LeadLock)
    const cameraStatus = await Camera.requestCameraPermissionsAsync();
    console.log('[PermissionManager] Camera:', cameraStatus.status);

    // 2. Location (GeoTargeting & Territory)
    const locationStatus = await Location.requestForegroundPermissionsAsync();
    console.log('[PermissionManager] Location:', locationStatus.status);

    // 3. Media Library (Excel Import & Gallery)
    const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    console.log('[PermissionManager] Gallery:', libraryStatus.status);

    // 4. Notifications (LensSignal & Reminders)
    const notificationStatus = await Notifications.requestPermissionsAsync();
    console.log('[PermissionManager] Notifications:', notificationStatus.status);

    // 5. Audio / Microphone (Voice Entry)
    let audioGranted = false;
    try {
      if (Platform.OS === 'android') {
        const audioRes = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        audioGranted = audioRes === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const audioRes = await Camera.requestMicrophonePermissionsAsync();
        audioGranted = audioRes.status === 'granted';
      }
    } catch (err) {
      console.warn('[PermissionManager] Audio permission error:', err);
    }
    console.log('[PermissionManager] Audio:', audioGranted ? 'granted' : 'denied');

    return {
      camera: cameraStatus.status === 'granted',
      location: locationStatus.status === 'granted',
      library: libraryStatus.status === 'granted',
      notifications: notificationStatus.status === 'granted',
      audio: audioGranted
    };
  } catch (err) {
    console.error('[PermissionManager] Error during bulk request:', err);
    return null;
  }
}
