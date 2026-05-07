-- Enable PostGIS extension if not enabled
create extension if not exists postgis;

-- LensSignal Table
create table if not exists lens_signals (
  id uuid default gen_random_uuid() primary key,
  business_name text not null,
  address text,
  city text,
  state text,
  zip text,
  latitude numeric not null,
  longitude numeric not null,

  -- Compliance Signal
  compliance_score text,         -- e.g. "98", "A", "Pass"
  compliance_level text,         -- "green", "yellow", "red"
  compliance_source text,        -- e.g. "City Health Dept"
  compliance_findings text,      -- e.g. "Minor debris in kitchen"

  -- Opening Signal
  opening_type text,             -- e.g. "New Sales Tax Permit", "DBA Filing"
  opening_date date,
  is_new_opening boolean default false,

  -- Pest Indicator
  has_pest_indicator boolean default false,
  pest_details text,             -- e.g. "Evidence of rodents found in dry storage"

  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Index for spatial queries if using geography/geometry,
-- but for simplicity we can use lat/lng numeric comparison or PostGIS points.
-- Let's add a PostGIS geography column for better nearby performance.
alter table lens_signals add column if not exists location geography(point, 4326);

-- Update location column based on lat/lng
update lens_signals
set location = st_geogfromtext('SRID=4326;POINT(' || longitude || ' ' || latitude || ')');

-- Create spatial index
create index if not exists lens_signals_location_idx on lens_signals using gist(location);

-- RPC for nearby signals
create or replace function get_nearby_lens_signals(
  lat numeric,
  lng numeric,
  radius_meters numeric default 5000
)
returns setof lens_signals
language plpgsql
as $$
begin
  return query
  select *
  from lens_signals
  where st_dwithin(
    location,
    st_geogfromtext('SRID=4326;POINT(' || lng || ' ' || lat || ')'),
    radius_meters
  )
  order by location <-> st_geogfromtext('SRID=4326;POINT(' || lng || ' ' || lat || ')');
end;
$$;

-- RLS
alter table lens_signals enable row level security;
create policy "Public signals are viewable by everyone" on lens_signals
  for select using (true);

-- Seed Data (Test Records)
insert into lens_signals (
  business_name, address, city, state, zip, latitude, longitude,
  compliance_score, compliance_level, compliance_source, compliance_findings,
  opening_type, is_new_opening,
  has_pest_indicator, pest_details
) values
(
  'The Rusty Spoon', '123 Main St', 'Austin', 'TX', '78701', 30.2672, -97.7431,
  '78', 'red', 'Austin Public Health', 'Multiple critical violations including temperature control.',
  null, false,
  true, 'Evidence of rodent activity in kitchen storage area.'
),
(
  'Fresh Brew Coffee', '456 Congress Ave', 'Austin', 'TX', '78701', 30.2682, -97.7421,
  '98', 'green', 'Austin Public Health', 'Minor maintenance items only.',
  'New Sales Tax Permit', true,
  false, null
),
(
  'Pest-Free Pizza', '789 6th St', 'Austin', 'TX', '78701', 30.2662, -97.7441,
  '85', 'yellow', 'Austin Public Health', 'Roach infestation noted in previous inspection, now mitigated.',
  null, false,
  true, 'Dead cockroaches found under prep table.'
),
(
  'New Horizon Bistro', '101 E 7th St', 'Austin', 'TX', '78701', 30.2692, -97.7411,
  null, null, null, null,
  'Certificate of Occupancy', true,
  false, null
);
