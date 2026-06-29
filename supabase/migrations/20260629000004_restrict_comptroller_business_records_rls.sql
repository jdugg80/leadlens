-- Migration: Restrict comptroller_business_records RLS
-- Drops permissive SELECT/INSERT/UPDATE policies for authenticated.
-- This is shared reference data (Texas Comptroller business registry).
-- Reads for authenticated, writes restricted to service_role only.

-- Drop old permissive policies
DROP POLICY IF EXISTS "Authenticated users can select comptroller records" ON comptroller_business_records;
DROP POLICY IF EXISTS "Authenticated users can insert comptroller records" ON comptroller_business_records;
DROP POLICY IF EXISTS "Authenticated users can update comptroller records" ON comptroller_business_records;

-- New policy: authenticated can read (shared reference data)
CREATE POLICY "Authenticated can read comptroller records"
  ON comptroller_business_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Note: No INSERT/UPDATE/DELETE policies for authenticated role.
-- All writes must go through service_role (comptrollerEnrichment.ts
-- upserts run via Edge Functions using service_role key).
--
-- This table is shared reference data — all reps see the same business
-- registry records. No per-user scoping needed.
