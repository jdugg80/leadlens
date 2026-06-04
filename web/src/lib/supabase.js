import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qkbvwryucaakkkqaqvka.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrYnZ3cnl1Y2Fha2trcWFxdmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzODIyNzUsImV4cCI6MjA5MTk1ODI3NX0.Mfi0ca1Ea_tdJlknL-8XKY2MwZpDAnzExco3saLc5RU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
