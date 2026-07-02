-- Migration: Create targetlens_permits table for residential building/renovation/new-construction signals.
-- Follows the same conventions as targetlens_prospects, targetlens_property_tax, and targetlens_mls_listings.

create table if not exists targetlens_permits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Permit classification
  permit_type text not null check (permit_type in ('building','renovation','new_construction')),
  permit_date date,
  status text default 'active',
  description text,

  -- Source / jurisdiction
  source text,
  source_jurisdiction text, -- e.g. "City of San Antonio"
  state text,
  county text,
  city text,

  -- Location
  address text,
  zip text,
  lat double precision,
  lng double precision,

  -- Raw enrichment payload
  raw_payload jsonb default '{}',

  -- Optional linkage to a known prospect or property record
  prospect_id uuid,
  property_tax_id uuid
);

-- Indexes
create index if not exists idx_targetlens_permits_type on targetlens_permits(permit_type);
create index if not exists idx_targetlens_permits_date on targetlens_permits(permit_date desc);
create index if not exists idx_targetlens_permits_jurisdiction on targetlens_permits(county, state);
create index if not exists idx_targetlens_permits_lat_lng on targetlens_permits(lat, lng);
create index if not exists idx_targetlens_permits_prospect on targetlens_permits(prospect_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_targetlens_permits_updated_at ON targetlens_permits;
CREATE TRIGGER set_targetlens_permits_updated_at
  BEFORE UPDATE ON targetlens_permits
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- RLS
alter table targetlens_permits enable row level security;

create policy "Users can read targetlens_permits"
  on targetlens_permits for select
  using (auth.role() = 'authenticated');

create policy "Service role can manage targetlens_permits"
  on targetlens_permits for all
  using (auth.role() = 'service_role');
