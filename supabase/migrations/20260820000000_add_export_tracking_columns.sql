-- Migration: Add reviewed sync column and exported_at tracking column
-- Date: 2026-08-20
-- Context: Phase 2 of scheduled export rebuild (AGENT-BUILD-PHASE2-SYNC-FIXES.md)
-- Adds two non-breaking, nullable columns to prospects.

-- ============================================================
-- 1. reviewed — boolean flag synced from client-side lead.reviewed
-- ============================================================
-- The client stores lead.reviewed (boolean) but buildRow() previously
-- only mapped reviewed_at (timestamptz from lead.reviewedAt, a different
-- field). This boolean is used by the reviewedOnly export filter.
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS reviewed boolean DEFAULT false;

-- ============================================================
-- 2. exported_at — timestamp written by server-side export (Edge Function)
-- ============================================================
-- A server-side scheduled export will set this after successfully sending
-- a lead, preventing re-export on the next run. Write logic belongs in
-- the Edge Function (later phase); this migration only adds the column.
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS exported_at timestamptz;
