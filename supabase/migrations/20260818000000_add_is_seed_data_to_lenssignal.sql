-- Migration: Add is_seed_data flag to lenssignal_records
-- Enables filtering test/seed rows out of production queries.
-- The get_lenssignal_nearby RPC is updated to exclude seed rows by default.

-- 1. Add column
ALTER TABLE lenssignal_records
  ADD COLUMN IF NOT EXISTS is_seed_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lenssignal_records_is_seed_data
  ON lenssignal_records(is_seed_data)
  WHERE is_seed_data = true;

-- 2. Backfill existing seed rows from the original migration
-- (The Rusty Spoon, Fresh Brew Coffee, New Horizon Bistro)
UPDATE lenssignal_records
SET is_seed_data = true
WHERE establishment_name IN ('The Rusty Spoon', 'Fresh Brew Coffee', 'New Horizon Bistro');

-- 3. Update RPC to exclude seed rows by default
CREATE OR REPLACE FUNCTION get_lenssignal_nearby(
  p_latitude numeric,
  p_longitude numeric,
  p_radius_miles numeric default 5,
  p_signal_layer text default null
)
RETURNS TABLE (
  id uuid,
  signal_layer text,
  establishment_name text,
  address text,
  city text,
  state text,
  zip text,
  latitude numeric,
  longitude numeric,
  score numeric,
  grade text,
  alert_level text,
  pest_indicator boolean,
  opening_status text,
  source_name text,
  source_record_url text,
  distance_miles numeric,
  owner_name text,
  phone text,
  raw_record jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  search_point geography;
  meters_per_mile numeric := 1609.34;
BEGIN
  search_point := st_setsrid(st_point(p_longitude, p_latitude), 4326)::geography;

  RETURN QUERY
  SELECT
    r.id,
    r.signal_layer,
    r.establishment_name,
    r.address,
    r.city,
    r.state,
    r.zip,
    r.latitude,
    r.longitude,
    r.score,
    r.grade,
    r.alert_level,
    r.pest_indicator,
    r.opening_status,
    r.source_name,
    r.source_record_url,
    (st_distance(r.location, search_point) / meters_per_mile)::numeric AS distance_miles,
    coalesce(r.raw_record->>'owner_name', r.raw_record->>'owner', r.raw_record->>'contact_name') AS owner_name,
    coalesce(r.raw_record->>'phone', r.raw_record->>'phone_number', r.raw_record->>'contact_phone') AS phone,
    r.raw_record
  FROM lenssignal_records r
  WHERE
    st_dwithin(r.location, search_point, p_radius_miles * meters_per_mile)
    AND (p_signal_layer IS NULL OR r.signal_layer = p_signal_layer)
    AND r.is_seed_data = false
  ORDER BY r.location <-> search_point;
END;
$$;
