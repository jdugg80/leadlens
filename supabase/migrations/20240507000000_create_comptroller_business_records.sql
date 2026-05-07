create table if not exists public.comptroller_business_records (
  id uuid primary key default gen_random_uuid(),

  source text not null default 'texas_comptroller',
  signal_type text not null,

  taxpayer_id text,
  location_number text,
  business_name text,
  location_name text,

  street text,
  city text,
  state text,
  zip text,

  permit_start_date date,
  permit_end_date date,
  permit_status text,

  latitude double precision,
  longitude double precision,

  badge text,
  priority text,

  raw_payload jsonb not null,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_comptroller_zip
on public.comptroller_business_records(zip);

create index if not exists idx_comptroller_taxpayer_id
on public.comptroller_business_records(taxpayer_id);

create index if not exists idx_comptroller_permit_start_date
on public.comptroller_business_records(permit_start_date);

create index if not exists idx_comptroller_signal_type
on public.comptroller_business_records(signal_type);

-- RLS
alter table public.comptroller_business_records enable row level security;

create policy "Authenticated users can read comptroller records"
on public.comptroller_business_records
for select
to authenticated
using (true);

create policy "Authenticated users can insert comptroller records"
on public.comptroller_business_records
for insert
to authenticated
with check (true);

create policy "Authenticated users can update comptroller records"
on public.comptroller_business_records
for update
to authenticated
using (true)
with check (true);
