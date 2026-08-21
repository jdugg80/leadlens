-- Migration: Create auto_export_settings table
-- Date: 2026-08-20
-- Context: Phase 3 of scheduled export rebuild (AGENT-BUILD-PHASE3-SETTINGS-SYNC.md)

create table if not exists auto_export_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean default false,
  time text default '16:00',
  recipients text default '',
  subject text default 'LeadLens Scheduled Export ({count} prospects)',
  body text default 'Attached is your scheduled LeadLens export containing {count} queued prospects.',
  export_format text default 'universal_excel',
  template_id text,
  template_name text,
  reviewed_only boolean default false,
  exclude_duplicates boolean default true,
  clear_after_send boolean default false,
  archive_after_send boolean default false,
  days integer[] default '{1,2,3,4,5}',
  last_status text default '',
  last_run_date date,
  updated_at timestamptz default now()
);

alter table auto_export_settings enable row level security;

create policy "Users can manage their own auto export settings"
  on auto_export_settings for all
  using (auth.uid() = user_id);

create index if not exists idx_auto_export_settings_user_id on auto_export_settings(user_id);
