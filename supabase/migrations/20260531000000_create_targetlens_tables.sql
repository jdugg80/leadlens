create table if not exists targetlens_prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  owner_name text,
  grantee_name text,
  grantor_name text,
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  county text,
  deed_transfer_date timestamptz,
  deed_transfer_price numeric,
  mls_close_price numeric,
  lienholder_name text,
  lienholder_type text,
  home_value_estimated numeric,
  home_value_assessed numeric,
  home_sq_footage integer,
  year_built integer,
  property_class text,
  use_code text,
  owner_phone text,
  owner_email text,
  homestead_exemption boolean default false,
  days_since_transfer integer,
  lookback_bucket text default '90d',
  prospect_type text check (prospect_type in ('new_homeowner','current_homeowner','rental')),
  efficiency_score integer default 50,
  upgrade_signals jsonb default '{}'::jsonb,
  enrichment_status text default 'pending',
  source text
);

create index if not exists idx_targetlens_prospects_lookback on targetlens_prospects(lookback_bucket);
create index if not exists idx_targetlens_prospects_type on targetlens_prospects(prospect_type);
create index if not exists idx_targetlens_prospects_lat_lng on targetlens_prospects(lat, lng);
create index if not exists idx_targetlens_prospects_score on targetlens_prospects(efficiency_score desc);
create index if not exists idx_targetlens_prospects_created on targetlens_prospects(created_at desc);

alter table targetlens_prospects enable row level security;

create policy "Users can read targetlens_prospects"
  on targetlens_prospects for select
  using (auth.role() = 'authenticated');

create policy "Service role can manage targetlens_prospects"
  on targetlens_prospects for all
  using (auth.role() = 'service_role');

create table if not exists targetlens_property_tax (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  account_number text,
  county text,
  state text,
  owner_name text,
  situs_address text,
  city text,
  zip text,
  appraised_value numeric,
  land_value numeric,
  improvement_value numeric,
  sq_footage integer,
  year_built integer,
  property_class_code text,
  exemptions jsonb default '[]'::jsonb,
  lat double precision,
  lng double precision,
  raw_payload jsonb
);

create index if not exists idx_targetlens_tax_county on targetlens_property_tax(county, state);
create index if not exists idx_targetlens_tax_address on targetlens_property_tax(situs_address);

alter table targetlens_property_tax enable row level security;

create policy "Service role can manage targetlens_property_tax"
  on targetlens_property_tax for all
  using (auth.role() = 'service_role');

create table if not exists targetlens_mls_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  mls_id text unique,
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  list_price numeric,
  close_price numeric,
  close_date timestamptz,
  sq_footage integer,
  bedrooms integer,
  bathrooms numeric,
  year_built integer,
  property_type text,
  seller_name text,
  buyer_name text,
  source text,
  raw_payload jsonb
);

create index if not exists idx_targetlens_mls_address on targetlens_mls_listings(address);
create index if not exists idx_targetlens_mls_close on targetlens_mls_listings(close_date desc);
create index if not exists idx_targetlens_mls_lat_lng on targetlens_mls_listings(lat, lng);

alter table targetlens_mls_listings enable row level security;

create policy "Service role can manage targetlens_mls_listings"
  on targetlens_mls_listings for all
  using (auth.role() = 'service_role');
