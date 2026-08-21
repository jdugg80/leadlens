-- Migration: Create export_templates table and export-templates storage bucket
-- Date: 2026-08-20
-- Context: Phase 4 of scheduled export rebuild (AGENT-BUILD-PHASE4-CUSTOM-TEMPLATE-STORAGE.md)

-- 1. Export templates table
create table if not exists export_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  template_storage_path text,
  sheet_name text,
  headers jsonb not null default '[]',
  mapping jsonb not null default '{}',
  file_base_name text,
  start_row integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);

alter table export_templates enable row level security;

create policy "Users can manage their own export templates"
  on export_templates for all
  using (auth.uid() = user_id);

create index if not exists idx_export_templates_user_id on export_templates(user_id);
create index if not exists idx_export_templates_user_name on export_templates(user_id, name);

-- 2. Storage bucket
insert into storage.buckets (id, name, public)
values ('export-templates', 'export-templates', false)
on conflict (id) do nothing;

-- 3. Storage RLS policy: users can only access files under their own user_id folder
drop policy if exists "Users can access their own export template files" on storage.objects;

create policy "Users can access their own export template files"
  on storage.objects for all
  using (
    bucket_id = 'export-templates'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'export-templates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
