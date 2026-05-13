import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';

/**
 * Modes for tracking when and why the location was captured.
 */
export type LocationCaptureMode = 'active_app' | 'start_my_day';

/**
 * Requests location permissions and upserts the user's current position to Supabase.
 * This is used for proximity alerts and territory heatmaps.
 */
export const saveUserLocationStatus = async (mode: LocationCaptureMode = 'active_app') => {
  try {
    // 1. Get current authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[saveUserLocationStatus] No authenticated user found');
      return { error: 'Not authenticated' };
    }

    // 2. Request foreground permissions
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[saveUserLocationStatus] Location permission denied');
      return { error: 'Permission denied' };
    }

    // 3. Get current location
    // Using balanced accuracy for a good tradeoff between speed and precision
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude, accuracy } = location.coords;

    // 4. Upsert to user_location_status
    // Note: The SQL migration uses a PostGIS geography column 'location'.
    // We can use a template literal for the WKT (Well-Known Text) point.
    const { error: upsertError } = await supabase
      .from('user_location_status')
      .upsert({
        user_id: user.id,
        location: `POINT(${longitude} ${latitude})`, // PostGIS expects (lng lat)
        latitude: latitude, // Optional: if we want numeric fallback columns
        longitude: longitude,
        accuracy_meters: accuracy,
        location_mode: mode,
        last_updated: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      console.error('[saveUserLocationStatus] Upsert failed:', upsertError);
      return { error: upsertError.message };
    }

    return { success: true, coords: { latitude, longitude } };
  } catch (err) {
    console.error('[saveUserLocationStatus] Unexpected error:', err);
    return { error: err instanceof Error ? err.message : String(err) };
  }
};
