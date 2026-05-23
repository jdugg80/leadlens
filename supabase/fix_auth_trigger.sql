-- 1. Ensure public.profiles has all necessary columns for Beta and Identity
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists role text default 'Rep',
  add column if not exists beta_status text default 'inactive';

-- 2. Create a dedicated beta_testers table for access control
-- This separates "who is a user" from "who has beta access"
create table if not exists public.beta_testers (
  email text primary key,
  is_active boolean default true,
  notes text,
  created_at timestamptz default now()
);

-- Enable RLS on beta_testers
alter table public.beta_testers enable row level security;

-- Allow authenticated users to read beta_testers
drop policy if exists "Allow authenticated read access to beta_testers" on public.beta_testers;
create policy "Allow authenticated read access to beta_testers"
  on public.beta_testers for select
  to authenticated
  using (true);

-- 3. Replace the handle_new_user trigger function with a SECURITY DEFINER version
-- This function runs with the privileges of the creator (postgres),
-- allowing it to insert into public.profiles even if RLS is strict.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  _full_name text;
  _first_name text;
  _last_name text;
  _role text;
begin
  -- 1. Extract metadata from social providers or email signup
  -- Coalesce looks for fields in common locations (Google, Microsoft, custom)
  _full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'rep_name',
    new.raw_user_meta_data->>'name',
    ''
  );

  _first_name := coalesce(
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'given_name',
    split_part(_full_name, ' ', 1),
    ''
  );

  _last_name := coalesce(
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'family_name',
    case
      when position(' ' in _full_name) > 0
      then substring(_full_name from position(' ' in _full_name) + 1)
      else ''
    end,
    ''
  );

  _role := coalesce(new.raw_user_meta_data->>'role', 'Rep');

  -- 2. Insert or update public.profiles
  -- Use ON CONFLICT to avoid duplicate errors if the user is recreated
  insert into public.profiles (
    id,
    email,
    full_name,
    first_name,
    last_name,
    role,
    beta_status,
    updated_at
  )
  values (
    new.id,
    new.email,
    _full_name,
    _first_name,
    _last_name,
    _role,
    'inactive', -- Always default to inactive; app will check beta_testers table
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = case when profiles.full_name = '' or profiles.full_name is null then excluded.full_name else profiles.full_name end,
    first_name = case when profiles.first_name = '' or profiles.first_name is null then excluded.first_name else profiles.first_name end,
    last_name = case when profiles.last_name = '' or profiles.last_name is null then excluded.last_name else profiles.last_name end,
    updated_at = now();

  return new;

exception when others then
  -- CRITICAL: Never let this function throw an error,
  -- as it will block the entire auth.users insertion.
  return new;
end;
$$;

-- 4. Re-bind the trigger to auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
