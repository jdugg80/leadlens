-- LensSignal Comprehensive Migration
-- Requirements: PostGIS, Multiple Tables, Triggers, RPC nearby search.

-- 1. Enable PostGIS
create extension if not exists postgis;

-- 2. Create Tables

-- Source registry for where data comes from
create table if not exists lenssignal_sources (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  description text,
  type text, -- e.g. 'rest_api', 'scraper', 'manual'
  base_url text,
  config jsonb default '{}',
  created_at timestamptz default now()
);

-- Core LensSignal records
create table if not exists lenssignal_records (
  id uuid default gen_random_uuid() primary key,
  signal_layer text not null, -- 'Compliance', 'Opening', etc.

  -- Location
  latitude numeric not null,
  longitude numeric not null,
  location geography(point, 4326),

  -- Identity
  establishment_name text not null,
  address text,
  city text,
  state text,
  zip text,

  -- Compliance Signal specific
  score numeric,
  grade text,
  violation_text text,
  pest_indicator boolean default false,
  pest_terms text[] default array[]::text[],

  -- Opening Signal specific
  opening_status text,
  permit_type text,
  permit_date date,

  -- Status and Source
  alert_level text, -- 'green', 'yellow', 'red'
  source_name text,
  source_record_url text,
  raw_record jsonb default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Link signals to prospects (leads)
create table if not exists prospect_lenssignal (
  id uuid default gen_random_uuid() primary key,
  prospect_id uuid, -- Reference to your main leads/prospects table if it exists
  lenssignal_id uuid references lenssignal_records(id) on delete cascade,
  created_at timestamptz default now(),
  unique(prospect_id, lenssignal_id)
);

-- Push tokens for notifications
create table if not exists user_push_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  push_token text not null,
  device_info jsonb default '{}',
  created_at timestamptz default now(),
  unique(user_id, push_token)
);

-- User location tracking for proximity alerts
create table if not exists user_location_status (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  location geography(point, 4326) not null,
  last_updated timestamptz default now()
);

-- User notification preferences
create table if not exists lenssignal_user_preferences (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  enable_compliance_alerts boolean default true,
  enable_opening_alerts boolean default true,
  min_alert_level text default 'yellow',
  radius_miles numeric default 5,
  preferences jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- Notification history
create table if not exists lenssignal_notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  lenssignal_id uuid references lenssignal_records(id) on delete set null,
  title text,
  body text,
  sent_at timestamptz default now()
);

-- 3. Triggers for geography column

-- Function to sync location geography from lat/lng
create or replace function fn_sync_lenssignal_location()
returns trigger as $$
begin
  if (new.latitude is not null and new.longitude is not null) then
    new.location := st_setsrid(st_point(new.longitude, new.latitude), 4326)::geography;
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger for insert or update on lenssignal_records
create trigger tr_sync_lenssignal_location
before insert or update of latitude, longitude
on lenssignal_records
for each row
execute function fn_sync_lenssignal_location();

-- 4. RPC Function for nearby search

create or replace function get_lenssignal_nearby(
  p_latitude numeric,
  p_longitude numeric,
  p_radius_miles numeric default 5,
  p_signal_layer text default null
)
returns table (
  id uuid,
  signal_layer text,
  establishment_name text,
  address text,
  city text,
  state text,
  zip text,
  latitude numeric,
  longitude numeric,
  score numeric,
  grade text,
  alert_level text,
  pest_indicator boolean,
  opening_status text,
  source_name text,
  source_record_url text,
  distance_miles numeric
)
language plpgsql
as $$
declare
  search_point geography;
  meters_per_mile numeric := 1609.34;
begin
  search_point := st_setsrid(st_point(p_longitude, p_latitude), 4326)::geography;

  return query
  select
    r.id,
    r.signal_layer,
    r.establishment_name,
    r.address,
    r.city,
    r.state,
    r.zip,
    r.latitude,
    r.longitude,
    r.score,
    r.grade,
    r.alert_level,
    r.pest_indicator,
    r.opening_status,
    r.source_name,
    r.source_record_url,
    (st_distance(r.location, search_point) / meters_per_mile)::numeric as distance_miles
  from lenssignal_records r
  where
    st_dwithin(r.location, search_point, p_radius_miles * meters_per_mile)
    and (p_signal_layer is null or r.signal_layer = p_signal_layer)
  order by r.location <-> search_point;
end;
$$;

-- 5. Indexes
create index if not exists idx_lenssignal_records_location on lenssignal_records using gist(location);
create index if not exists idx_user_location_status_location on user_location_status using gist(location);
create index if not exists idx_lenssignal_records_layer on lenssignal_records(signal_layer);
create index if not exists idx_lenssignal_records_alert_level on lenssignal_records(alert_level);
create index if not exists idx_lenssignal_records_pest_indicator on lenssignal_records(pest_indicator);

-- Row Level Security (Initial public viewable for records)
alter table lenssignal_records enable row level security;
create policy "Public lenssignal_records are viewable by everyone"
  on lenssignal_records for select using (true);

-- User-specific tables RLS
alter table user_push_tokens enable row level security;
create policy "Users can manage their own push tokens"
  on user_push_tokens for all using (auth.uid() = user_id);

alter table user_location_status enable row level security;
create policy "Users can manage their own location status"
  on user_location_status for all using (auth.uid() = user_id);

alter table lenssignal_user_preferences enable row level security;
create policy "Users can manage their own preferences"
  on lenssignal_user_preferences for all using (auth.uid() = user_id);

alter table lenssignal_notifications enable row level security;
create policy "Users can view their own notifications"
  on lenssignal_notifications for select using (auth.uid() = user_id);

-- 6. Seed Data (Optional for testing)
insert into lenssignal_records (
  signal_layer, latitude, longitude, establishment_name, address, city, state, zip,
  score, grade, alert_level, pest_indicator, pest_terms, source_name
) values
(
  'Compliance', 30.2672, -97.7431, 'The Rusty Spoon', '123 Main St', 'Austin', 'TX', '78701',
  78, 'C', 'red', true, array['rodent', 'droppings'], 'Austin Public Health'
),
(
  'Compliance', 30.2682, -97.7421, 'Fresh Brew Coffee', '456 Congress Ave', 'Austin', 'TX', '78701',
  98, 'A', 'green', false, array[]::text[], 'Austin Public Health'
);

insert into lenssignal_records (
  signal_layer, latitude, longitude, establishment_name, address, city, state, zip,
  opening_status, permit_type, permit_date, alert_level, source_name
) values
(
  'Opening', 30.2692, -97.7411, 'New Horizon Bistro', '101 E 7th St', 'Austin', 'TX', '78701',
  'Pending', 'Certificate of Occupancy', '2023-12-01', 'green', 'City of Austin'
);
