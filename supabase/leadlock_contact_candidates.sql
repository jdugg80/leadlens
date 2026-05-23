create table if not exists contact_candidates (
  id uuid default gen_random_uuid() primary key,
  prospect_id uuid,
  business_name text,
  normalized_business_name text,
  contact_full_name text,
  first_name text,
  last_name text,
  title text,
  phone text,
  email text,
  source text,
  source_url text,
  confidence_score numeric,
  confidence_label text,
  match_reasons jsonb,
  created_at timestamptz default now(),
  last_verified_at timestamptz
);

alter table contact_candidates enable row level security;
create policy "Users can read candidates" on contact_candidates for select to authenticated using (true);
create policy "Users can insert candidates" on contact_candidates for insert to authenticated with check (true);