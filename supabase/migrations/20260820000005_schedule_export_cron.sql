-- Migration: Schedule scheduled-export-run Edge Function via pg_cron
-- Date: 2026-08-20
-- Context: Phase 6 of scheduled export rebuild (AGENT-BUILD-PHASE6-CRON-WIRING.md)
-- Fires the Phase 5 Edge Function every 15 minutes using pg_net.
-- Secrets (function URL and service role key) are stored in Supabase Vault
-- and referenced by name so no credentials are committed to this file.

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Schedule the recurring invocation.
-- The exact cron job name is "scheduled-export-run-every-15-min" so it can be
-- paused/unscheduled later without a code deploy.
SELECT cron.schedule(
  'scheduled-export-run-every-15-min',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scheduled_export_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'scheduled_export_service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) AS request_id;
  $$
);
