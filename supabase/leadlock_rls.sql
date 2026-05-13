-- PHASE 1: LEADLOCK MATCHING BRAIN - RLS (RE-VERIFIED)
-- Implements safe Row-Level Security for all LeadLock tables.

-- 1. Enable RLS
alter table leadlock_captures enable row level security;
alter table leadlock_detected_regions enable row level security;
alter table leadlock_match_candidates enable row level security;
alter table leadlock_match_feedback enable row level security;

-- 2. leadlock_captures Policies
drop policy if exists "Manage own captures" on leadlock_captures;
create policy "Manage own captures" on leadlock_captures
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. leadlock_detected_regions Policies
drop policy if exists "View own regions" on leadlock_detected_regions;
create policy "View own regions" on leadlock_detected_regions
  for select to authenticated
  using (
    exists (select 1 from leadlock_captures where id = capture_id and user_id = auth.uid())
  );

-- 4. leadlock_match_candidates Policies
drop policy if exists "View own matches" on leadlock_match_candidates;
create policy "View own matches" on leadlock_match_candidates
  for select to authenticated
  using (
    exists (select 1 from leadlock_captures where id = capture_id and user_id = auth.uid())
  );

-- 5. leadlock_match_feedback Policies
drop policy if exists "Manage own feedback" on leadlock_match_feedback;
create policy "Manage own feedback" on leadlock_match_feedback
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
