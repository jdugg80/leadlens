-- Prospects (Leads) Table
create table if not exists prospects (
  id uuid default gen_random_uuid() primary key,
  business_name text not null,
  poc_first text,
  poc_last text,
  phone text,
  email text,
  website text,

  -- Social Links
  facebook_url text,
  instagram_url text,
  linkedin_url text,
  tiktok_url text,
  youtube_url text,
  x_url text,
  social_confidence text default 'none',
  social_source text,

  -- Address
  address text,
  street_number text,
  street_name text,
  address_line2 text,
  city text,
  state text,
  zip text,

  -- Classification & Status
  status text default 'Suspect',
  property_type text default 'Commercial',
  vertical text default 'Retail',
  capture_method text default 'manual',
  confidence text default 'medium',
  notes text,

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete set null
);

-- RLS
alter table prospects enable row level security;

create policy "Users can manage their own prospects"
  on prospects for all using (auth.uid() = user_id);

create index if not exists idx_prospects_user_id on prospects(user_id);
create index if not exists idx_prospects_status on prospects(status);
create index if not exists idx_prospects_business_name on prospects(business_name);
