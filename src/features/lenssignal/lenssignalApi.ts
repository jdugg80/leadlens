import { supabase } from '../../lib/supabase';
import { LensSignalRecord, LensSignalLayer } from './lenssignalTypes';

/**
 * Fetches LensSignal records from Supabase using spatial RPC.
 */
export const fetchLensSignalNearby = async (
  latitude: number,
  longitude: number,
  radiusMiles: number = 5,
  signalLayer: LensSignalLayer | null = null
): Promise<LensSignalRecord[]> => {
  try {
    const params: any = {
      p_latitude: latitude,
      p_longitude: longitude,
      p_radius_miles: radiusMiles
    };

    if (signalLayer) {
      params.p_signal_layer = signalLayer;
    }

    const { data, error } = await supabase.rpc('get_lenssignal_nearby', params);

    if (error) {
      console.warn('[LensSignalApi] Error calling get_lenssignal_nearby:', error);
      return [];
    }

    return (data as LensSignalRecord[]) || [];
  } catch (err) {
    console.warn('[LensSignalApi] Unexpected exception in fetchLensSignalNearby:', err);
    return [];
  }
};
