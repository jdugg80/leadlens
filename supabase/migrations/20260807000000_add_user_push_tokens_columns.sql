-- Add missing columns to user_push_tokens that registerPushToken.ts expects.
-- These columns were referenced in the upsert but never added via migration,
-- causing silent push registration failures.

ALTER TABLE public.user_push_tokens
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
