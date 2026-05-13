-- PHASE 1: LEADLOCK MATCHING BRAIN - SCHEMA (TYPE COMPATIBILITY FIX)
-- Synchronizes types with existing prospects/lens_signals (TEXT IDs)

-- 1. Extensions
create extension if not exists postgis;
create extension if not exists pg_trgm;

-- 2. LeadLock Captures Table
create table if not exists leadlock_captures (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  image_path text,

  -- OCR Data
  raw_ocr_text text,
  normalized_ocr_text text,
  ocr_summary text,
  device_confidence numeric,

  -- Metadata & Context
  latitude numeric,
  longitude numeric,
  location geography(point, 4326),
  heading numeric,
  zoom_level numeric,
  capture_type text,

  -- Result tracking
  processing_status text default 'pending',
  -- FIX: prospects.id is TEXT, so this must be TEXT
  final_lead_id text,

  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. LeadLock Detected Regions
create table if not exists leadlock_detected_regions (
  id uuid default gen_random_uuid() primary key,
  capture_id uuid references leadlock_captures(id) on delete cascade not null,
  box_json jsonb,
  label text,
  confidence numeric,
  ocr_text text,
  normalized_text text,
  created_at timestamptz default now()
);

-- 4. LeadLock Match Candidates
create table if not exists leadlock_match_candidates (
  id uuid default gen_random_uuid() primary key,
  capture_id uuid references leadlock_captures(id) on delete cascade not null,
  region_id uuid references leadlock_detected_regions(id) on delete cascade,

  -- FIX: References are TEXT to match existing tables
  prospect_id text,
  lens_signal_id text,

  total_score numeric not null,
  name_similarity numeric default 0,
  distance_score numeric default 0,
  contact_match_score numeric default 0,

  match_method text,
  created_at timestamptz default now()
);

-- 5. LeadLock Match Feedback
create table if not exists leadlock_match_feedback (
  id uuid default gen_random_uuid() primary key,
  capture_id uuid references leadlock_captures(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  action text not null,
  matched_id text, -- FIX: TEXT to match leads/signals
  feedback_notes text,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_ll_captures_location on leadlock_captures using gist(location);
create index if not exists idx_ll_captures_user_created on leadlock_captures(user_id, created_at desc);
-- Note: Ensure trigram index exists on prospects table for speed
-- create index if not exists idx_prospects_name_trgm on prospects using gin (business_name gin_trgm_ops);
