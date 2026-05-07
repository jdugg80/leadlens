import { supabase } from '../../lib/supabase';

export const registerPushToken = async (userId: string, token: string, deviceInfo: any = {}) => {
  const { error } = await supabase.from('user_push_tokens').upsert({
    user_id: userId,
    push_token: token,
    device_info: deviceInfo
  });

  return { error };
};
