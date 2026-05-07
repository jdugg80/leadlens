import { supabase } from '../../lib/supabase';

export const saveUserLocationStatus = async (userId: string, lat: number, lng: number) => {
  // PostGIS expects longitude then latitude for POINT
  const { error } = await supabase.from('user_location_status').upsert({
    user_id: userId,
    location: `SRID=4326;POINT(${lng} ${lat})`,
    last_updated: new Date().toISOString()
  });

  return { error };
};
