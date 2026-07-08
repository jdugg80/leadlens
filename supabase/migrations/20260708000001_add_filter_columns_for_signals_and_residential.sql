-- Migration: Add filter columns for LensSignals commercial + residential spec

-- 1. lenssignal_records: new columns for commercial signal filtering and residential signals
alter table lenssignal_records
  add column if not exists signal_type text,
  add column if not exists compliance_score numeric,
  add column if not exists compliance_rating text,
  add column if not exists health_violation_flag boolean default false,
  add column if not exists star_rating numeric,
  add column if not exists new_homeowner_flag boolean default false,
  add column if not exists renovation_permit_flag boolean default false,
  add column if not exists new_construction_permit_flag boolean default false,
  add column if not exists estimated_home_value numeric,
  add column if not exists approx_square_footage numeric,
  add column if not exists residential_signal boolean default false,
  add column if not exists occupancy_type text,
  add column if not exists property_type text,
  add column if not exists signal_date timestamptz;

create index if not exists idx_lenssignal_records_signal_type on lenssignal_records(signal_type);
create index if not exists idx_lenssignal_records_compliance_score on lenssignal_records(compliance_score);
create index if not exists idx_lenssignal_records_health_violation on lenssignal_records(health_violation_flag);
create index if not exists idx_lenssignal_records_star_rating on lenssignal_records(star_rating);
create index if not exists idx_lenssignal_records_new_homeowner on lenssignal_records(new_homeowner_flag);
create index if not exists idx_lenssignal_records_renovation_permit on lenssignal_records(renovation_permit_flag);
create index if not exists idx_lenssignal_records_new_construction on lenssignal_records(new_construction_permit_flag);
create index if not exists idx_lenssignal_records_residential_signal on lenssignal_records(residential_signal);
create index if not exists idx_lenssignal_records_signal_date on lenssignal_records(signal_date desc);

comment on column lenssignal_records.signal_type is 'Commercial signal classification: New Business Openings, Ownership Changes, Health Code Violations';
comment on column lenssignal_records.residential_signal is 'True when the signal represents a residential event (new homeowner, renovation, new construction)';

-- 2. targetlens_prospects: new columns for residential filtering and signals
alter table targetlens_prospects
  add column if not exists occupancy_type text,
  add column if not exists residential_property_type text,
  add column if not exists renovation_permit_flag boolean default false,
  add column if not exists new_construction_permit_flag boolean default false,
  add column if not exists new_homeowner_flag boolean default false,
  add column if not exists signal_date timestamptz,
  add column if not exists signal_source text,
  add column if not exists permit_type text,
  add column if not exists permit_date date;

create index if not exists idx_targetlens_prospects_occupancy on targetlens_prospects(occupancy_type);
create index if not exists idx_targetlens_prospects_residential_type on targetlens_prospects(residential_property_type);
create index if not exists idx_targetlens_prospects_new_homeowner on targetlens_prospects(new_homeowner_flag);
create index if not exists idx_targetlens_prospects_renovation on targetlens_prospects(renovation_permit_flag);
create index if not exists idx_targetlens_prospects_new_construction on targetlens_prospects(new_construction_permit_flag);
create index if not exists idx_targetlens_prospects_signal_date on targetlens_prospects(signal_date desc);

-- 3. Update RLS for lenssignal_records to allow authenticated reads (mirrors other app tables)
-- The existing public policy is intentionally kept for compatibility; add a narrower authenticated policy.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lenssignal_records'
      and policyname = 'Authenticated users can read lenssignal_records'
  ) then
    create policy "Authenticated users can read lenssignal_records"
      on lenssignal_records for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lenssignal_records'
      and policyname = 'Service role can manage lenssignal_records'
  ) then
    create policy "Service role can manage lenssignal_records"
      on lenssignal_records for all
      using (auth.role() = 'service_role');
  end if;
end $$;
