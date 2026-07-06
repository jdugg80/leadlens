-- Migration: Add property_records_source column
-- Date: 2026-07-06
-- Context: Property source flag fix (AGENT-FIX-PROPERTY-SOURCE-FLAG.md)
-- Surfaces whether property data came from HCAD (verified) or AI estimate.

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS property_records_source text;
