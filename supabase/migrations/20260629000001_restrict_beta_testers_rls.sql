-- Migration: Restrict beta_testers RLS
-- Drops the permissive USING (true) SELECT policy and replaces with
-- email-scoped access: users can only read their own beta status.
-- Write access remains restricted to service_role (admin-managed table).

-- Drop the old permissive policy
DROP POLICY IF EXISTS "Allow authenticated read access to beta_testers" ON beta_testers;

-- New policy: authenticated users can only read their own row
CREATE POLICY "Users can read own beta status"
  ON beta_testers
  FOR SELECT
  TO authenticated
  USING (email = auth.email());

-- Note: No INSERT/UPDATE/DELETE policies for authenticated role.
-- This table is admin-managed via service_role only.
-- LoginScreen.js queries beta_testers by the logged-in user's email
-- to check beta access, so email-scoped SELECT is sufficient.
