import { supabase } from '../../lib/supabase';
import { LensSignal } from './lenssignalTypes';

export const fetchNearbySignals = async (
  lat: number,
  lng: number,
  radiusMiles: number = 5,
  layer?: string
): Promise<LensSignal[]> => {
  const { data, error } = await supabase.rpc('get_lenssignal_nearby', {
    p_latitude: lat,
    p_longitude: lng,
    p_radius_miles: radiusMiles,
    p_signal_layer: layer || null
  });

  if (error) {
    console.error('[LensSignalApi] Error fetching signals:', error);
    throw error;
  }
  return data || [];
};
