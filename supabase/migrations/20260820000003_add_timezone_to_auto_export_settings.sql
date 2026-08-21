-- Migration: Add timezone column to auto_export_settings
-- Date: 2026-08-20
-- Context: Phase 5 of scheduled export rebuild (AGENT-BUILD-PHASE5-EXPORT-EDGE-FUNCTION.md)
-- Adds an IANA timezone column inferred from the device when saving settings.

ALTER TABLE auto_export_settings
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Chicago';

-- Backfill existing rows to the default timezone so the Edge Function
-- can compute due dates consistently even for older settings.
UPDATE auto_export_settings
  SET timezone = 'America/Chicago'
  WHERE timezone IS NULL OR timezone = '';
