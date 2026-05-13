-- PHASE 1: LEADLOCK MATCHING BRAIN - STORAGE
-- Sets up the private bucket for LeadLock image captures.

-- 1. Create the bucket
insert into storage.buckets (id, name, public)
values ('leadlock-captures', 'leadlock-captures', false)
on conflict (id) do nothing;

-- 2. Storage RLS Policies

-- Policy: Allow users to upload their own captures
-- We expect the folder structure to be: {user_id}/{capture_id}.jpg
create policy "Allow users to upload their own captures"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'leadlock-captures' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow users to view only their own captures
create policy "Allow users to view their own captures"
on storage.objects for select
to authenticated
using (
  bucket_id = 'leadlock-captures' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow users to delete their own captures
create policy "Allow users to delete their own captures"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'leadlock-captures' and
  (storage.foldername(name))[1] = auth.uid()::text
);
