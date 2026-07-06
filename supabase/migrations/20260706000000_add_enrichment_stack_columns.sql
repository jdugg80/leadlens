-- Migration: Add enrichment stack columns and backfill source_type
-- Date: 2026-07-06
-- Context: Step 1 of enrichment stack build (AGENT-BUILD-PROSPECT-SCHEMA.md)
-- Adds 2 new columns; backfills source_type from existing capture_method.

-- ============================================================
-- PART 1: Add new columns (nullable, no impact on existing rows)
-- ============================================================

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS discovery_signal text;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS confidence_score numeric;

-- ============================================================
-- PART 2: Backfill source_type from capture_method
-- ============================================================
-- Mapping (confirmed via full 1582-row scan):
--   spreadsheet-import -> manual       (1503 rows)
--   manual             -> manual       (2 rows)
--   image              -> unknown      (45 rows)
--   LEADLOCK_PHOTO     -> leadlock     (8 rows)
--   business-card      -> card_scan    (7 rows)
--   ai-scan            -> card_scan    (6 rows)
--   LensSignal         -> territory_auto (5 rows)
--   map-prospect       -> territory_auto (3 rows)
--   Nearby Search      -> territory_auto (3 rows)
--   NULL or empty      -> unknown

UPDATE prospects
SET source_type = CASE
  WHEN capture_method IN ('spreadsheet-import', 'manual') THEN 'manual'
  WHEN capture_method = 'LEADLOCK_PHOTO' THEN 'leadlock'
  WHEN capture_method IN ('business-card', 'ai-scan') THEN 'card_scan'
  WHEN capture_method IN ('LensSignal', 'map-prospect', 'Nearby Search') THEN 'territory_auto'
  ELSE 'unknown'
END
WHERE source_type IS NULL;

-- ============================================================
-- PART 3: Verify backfill distribution
-- ============================================================
-- Run after migration: SELECT source_type, count(*) FROM prospects GROUP BY source_type;
