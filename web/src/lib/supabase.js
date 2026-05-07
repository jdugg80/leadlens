import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qkbvwryucaakkkqaqvka.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_S9FF0lsy9EpNcbXn6jF6Aw_ml-pGDbF';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
