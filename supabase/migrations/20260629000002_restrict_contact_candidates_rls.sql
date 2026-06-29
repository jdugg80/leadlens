-- Migration: Restrict contact_candidates RLS
-- Drops permissive USING (true) SELECT and INSERT policies.
-- This table has no user_id/rep_id column (schema gap — see note below).
-- Interim measure: reads for authenticated, writes restricted to service_role only.

-- Drop old permissive policies
DROP POLICY IF EXISTS "Users can read candidates" ON contact_candidates;
DROP POLICY IF EXISTS "Users can insert candidates" ON contact_candidates;

-- New policy: authenticated can read (no owner scoping — no owner column exists)
CREATE POLICY "Authenticated can read contact candidates"
  ON contact_candidates
  FOR SELECT
  TO authenticated
  USING (true);

-- Note: No INSERT/UPDATE/DELETE policies for authenticated role.
-- All writes must go through service_role (Edge Functions / backend only).
--
-- SCHEMA GAP: This table has no user_id or rep_id column, so reads
-- cannot be scoped to individual reps. All authenticated users can see
-- all contact candidates. A follow-up migration should add an owner
-- column and scope SELECT to that owner.
