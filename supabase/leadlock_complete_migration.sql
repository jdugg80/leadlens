-- LeadLock OCR & Matching Enhancement - Complete Migration
-- Covers Phases 1-4

-- 1. EXTENSIONS
create extension if not exists postgis;
create extension if not exists pg_trgm;

-- 2. TABLES
create table if not exists leadlock_captures (
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
  final_lead_id text, -- matches prospects.id type
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists leadlock_detected_regions (
  id uuid default gen_random_uuid() primary key,
  capture_id uuid references leadlock_captures(id) on delete cascade not null,
  box_json jsonb,
  label text,
  confidence numeric,
  ocr_text text,
  normalized_text text,
  detected_name text,
  detected_phone text,
  created_at timestamptz default now()
);

create table if not exists leadlock_match_candidates (
  id uuid default gen_random_uuid() primary key,
  capture_id uuid references leadlock_captures(id) on delete cascade not null,
  region_id uuid references leadlock_detected_regions(id) on delete cascade,
  prospect_id text,
  lens_signal_id text,
  total_score numeric not null,
  name_similarity numeric default 0,
  distance_score numeric default 0,
  contact_match_score numeric default 0,
  match_method text,
  created_at timestamptz default now()
);

create table if not exists leadlock_match_feedback (
  id uuid default gen_random_uuid() primary key,
  capture_id uuid references leadlock_captures(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  action text not null,
  matched_id text,
  feedback_notes text,
  created_at timestamptz default now()
);

-- 3. INDEXES
create index if not exists idx_ll_captures_location on leadlock_captures using gist(location);
create index if not exists idx_ll_captures_user_created on leadlock_captures(user_id, created_at desc);

-- 4. RLS POLICIES
alter table leadlock_captures enable row level security;
alter table leadlock_detected_regions enable row level security;
alter table leadlock_match_candidates enable row level security;
alter table leadlock_match_feedback enable row level security;

create policy "Manage own captures" on leadlock_captures for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "View own regions" on leadlock_detected_regions for select to authenticated using (exists (select 1 from leadlock_captures where id = capture_id and user_id = auth.uid()));
create policy "View own matches" on leadlock_match_candidates for select to authenticated using (exists (select 1 from leadlock_captures where id = capture_id and user_id = auth.uid()));
create policy "Manage own feedback" on leadlock_match_feedback for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. MATCHING RPC
create or replace function match_leadlock_capture(
  p_capture_id uuid,
  p_radius_meters integer default 250
)
returns table (
  match_id text,
  match_type text,
  name text,
  address text,
  total_score numeric,
  match_details jsonb
) language plpgsql as $$
declare
  v_cap record;
begin
  select * into v_cap from leadlock_captures where id = p_capture_id;
  if v_cap is null then raise exception 'Capture not found'; end if;
  if v_cap.user_id != auth.uid() then raise exception 'Unauthorized'; end if;

  return query
  with raw_matches as (
    select
      p.id as m_id, 'prospect' as m_type, p.business_name as m_name,
      (coalesce(p.street_number, '') || ' ' || coalesce(p.street_name, '')) as m_addr,
      similarity(p.business_name, coalesce(v_cap.detected_name, '')) as s_name,
      0.0::numeric as s_dist
    from prospects p
    where p.user_id = auth.uid()
    and p.business_name % v_cap.detected_name

    union all

    select
      ls.id as m_id, 'signal' as m_type, ls.establishment_name as m_name, ls.address as m_addr,
      similarity(ls.establishment_name, coalesce(v_cap.detected_name, '')) as s_name,
      (case when v_cap.location is not null and st_dwithin(ls.location, v_cap.location, p_radius_meters) then 1.0 else 0.0 end) as s_dist
    from lens_signals ls
    where (v_cap.detected_name is not null and ls.establishment_name % v_cap.detected_name)
    or (v_cap.location is not null and st_dwithin(ls.location, v_cap.location, p_radius_meters))
  )
  select
    m_id, m_type, m_name, m_addr,
    (s_name * 0.7 + s_dist * 0.3)::numeric as total_score,
    jsonb_build_object('name_sim', s_name, 'dist_score', s_dist)
  from raw_matches
  order by 5 desc limit 10;
end;
$$;
