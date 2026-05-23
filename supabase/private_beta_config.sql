-- LeadLens Private Beta Configuration - REPAIR VERSION
-- This script is designed to be run multiple times safely.

-- 0. Extensions
create extension if not exists postgis;
create extension if not exists pg_trgm;

-- 1. Profiles Table
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  rep_name text,
  full_name text,
  first_name text,
  last_name text,
  role text default 'Rep',
  branch_num text,
  employee_num text,
  beta_status text default 'inactive',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure all columns exist (Safe for existing tables)
do $$
begin
    alter table public.profiles add column if not exists beta_status text default 'inactive';
    alter table public.profiles add column if not exists email text;
    alter table public.profiles add column if not exists rep_name text;
    alter table public.profiles add column if not exists full_name text;
    alter table public.profiles add column if not exists first_name text;
    alter table public.profiles add column if not exists last_name text;
    alter table public.profiles add column if not exists role text default 'Rep';
    alter table public.profiles add column if not exists branch_num text;
    alter table public.profiles add column if not exists employee_num text;
end $$;

-- 1.1 Beta Testers
create table if not exists public.beta_testers (
  email text primary key,
  is_active boolean default true,
  notes text,
  created_at timestamptz default now()
);

-- 2. Prospects Table (The one that caused the error)
create table if not exists public.prospects (
  id uuid default gen_random_uuid() primary key,
  business_name text not null,
  poc_first text,
  poc_last text,
  phone text,
  email text,
  website text,
  facebook_url text,
  instagram_url text,
  linkedin_url text,
  tiktok_url text,
  youtube_url text,
  x_url text,
  social_confidence text default 'none',
  social_source text,
  street_number text,
  street_name text,
  address_line2 text,
  city text,
  state text,
  zip text,
  status text default 'Suspect',
  property_type text default 'Commercial',
  vertical text default 'Retail',
  capture_method text default 'manual',
  confidence text default 'medium',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete set null
);

-- 3. LeadLock Captures
create table if not exists public.leadlock_captures (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  image_path text,
  raw_ocr_text text,
  normalized_ocr_text text,
  ocr_summary text,
  device_confidence numeric,
  latitude numeric,
  longitude numeric,
  location geography(point, 4326),
  heading numeric,
  zoom_level numeric,
  capture_type text,
  processing_status text default 'pending',
  final_lead_id text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Enable RLS and Policies (Safe grouping)
do $$
begin
    alter table public.profiles enable row level security;
    alter table public.beta_testers enable row level security;
    alter table public.prospects enable row level security;
    alter table public.leadlock_captures enable row level security;
exception when others then
    raise notice 'RLS already enabled or table missing';
end $$;

-- 5. Trigger for automatic profile creation (THE CRITICAL SIGNUP FIX)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, full_name, beta_status, updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'inactive',
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  return new;
exception when others then
  -- NEVER fail the auth signup
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. Add RLS Policies
drop policy if exists "Users can manage their own profile" on public.profiles;
create policy "Users can manage their own profile" on public.profiles for all using (auth.uid() = id);

drop policy if exists "Allow authenticated read access to beta_testers" on public.beta_testers;
create policy "Allow authenticated read access to beta_testers" on public.beta_testers for select to authenticated using (true);

drop policy if exists "Users can manage their own prospects" on public.prospects;
create policy "Users can manage their own prospects" on public.prospects for all using (auth.uid() = user_id);
