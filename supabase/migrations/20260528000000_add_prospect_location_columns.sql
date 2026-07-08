-- Migration: Add prospect location, capture, and enrichment metadata columns
-- Date: 2026-05-28

alter table prospects
add column if not exists address text,
add column if not exists latitude double precision,
add column if not exists longitude double precision,
add column if not exists photo_zip text,
add column if not exists location_source text,
add column if not exists location_confidence numeric,
add column if not exists location_warning text,
add column if not exists gps_accuracy_meters numeric,
add column if not exists captured_at timestamptz,
add column if not exists enrichment_confidence text,
add column if not exists enrichment_confidence_score numeric,
add column if not exists enrichment_status text,
add column if not exists enrichment_notes text;

-- NOTE: This migration is additive and intentionally does not remove or rename
-- any existing columns. It adds fields to store resolved photo location,
-- capture metadata, and basic enrichment tracking fields.
