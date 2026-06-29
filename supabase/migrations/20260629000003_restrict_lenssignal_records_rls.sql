-- Migration: Restrict lenssignal_records RLS
-- Drops permissive USING (true) SELECT policy (which was public, not even
-- scoped to authenticated). Replaces with authenticated-only read.
-- No user_id column — this is shared reference data (compliance records,
-- business openings). Writes restricted to service_role only.

-- Drop old permissive policy
DROP POLICY IF EXISTS "Public lenssignal_records are viewable by everyone" ON lenssignal_records;

-- New policy: only authenticated users can read (not anon/public)
CREATE POLICY "Authenticated can read lenssignal records"
  ON lenssignal_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Note: No INSERT/UPDATE/DELETE policies for authenticated role.
-- All writes must go through service_role (data ingestion pipelines only).
--
-- SCHEMA GAP: This table has no user_id or rep_id column. All authenticated
-- users can see all signal records. This may be intentional for shared
-- reference data, but if per-rep scoping is needed later, a follow-up
-- migration should add an owner column.
