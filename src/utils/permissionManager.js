import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Platform, PermissionsAndroid } from 'react-native';

const PERMISSIONS_CHECKED_KEY = '@leadlens_permissions_setup_v1';

/**
 * Checks if we have already prompted the user for the "bulk" permission grant.
 */
export async function hasRequestedBulkPermissions() {
  // Bypass MMKV — use raw AsyncStorage for this flag.
  try {
    const RawStorage = require('@react-native-async-storage/async-storage').default;
    const val = await RawStorage.getItem(PERMISSIONS_CHECKED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Marks that we have attempted the bulk permission grant.
 */
export async function markBulkPermissionsRequested() {
  // Bypass MMKV — use raw AsyncStorage.
  try {
    const RawStorage = require('@react-native-async-storage/async-storage').default;
    await RawStorage.setItem(PERMISSIONS_CHECKED_KEY, 'true');
  } catch (e) {
    console.warn('[PermissionManager] Could not mark permissions requested:', e?.message || e);
  }
}

/**
 * Checks current permission state without prompting.
 */
export async function checkCriticalPermissions() {
  try {
    const camera = await Camera.getCameraPermissionsAsync();
    const location = await Location.getForegroundPermissionsAsync();

    return {
      camera: camera?.status === 'granted',
      location: location?.status === 'granted',
      allGranted: camera?.status === 'granted' && location?.status === 'granted',
      cameraCanAsk: camera?.canAskAgain !== false,
      locationCanAsk: location?.canAskAgain !== false,
    };
  } catch (e) {
    console.warn('[PermissionManager] checkCriticalPermissions error:', e);
    return {
      camera: false,
      location: false,
      allGranted: false,
      cameraCanAsk: true,
      locationCanAsk: true,
    };
  }
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
