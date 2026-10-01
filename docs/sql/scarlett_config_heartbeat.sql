-- Run in the PROJECT SCARLETT Supabase project (dlntgyhfxxbcwwcxaorn) ONLY.
-- Do NOT run this in the LeadLens project.
-- If BetaTracker already records sessions/last_seen, add build_code there instead
-- of creating tester_heartbeat, and check that app_config doesn't already exist.

-- 1) Force-update config -------------------------------------------------------
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "app_config readable by app"
  on public.app_config for select
  to anon, authenticated
  using (true);

insert into public.app_config (key, value)
values ('force_update', '{"min_version_code": 0, "apk_url": ""}'::jsonb)
on conflict (key) do nothing;

-- To force everyone onto a build (run when you are ready):
-- update public.app_config
-- set value = '{"min_version_code": 123, "apk_url": "https://YOUR-APK-LINK"}'::jsonb,
--     updated_at = now()
-- where key = 'force_update';

-- 2) Heartbeat -----------------------------------------------------------------
create table if not exists public.tester_heartbeat (
  tester_id  text primary key,
  build_code integer,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  sessions   integer not null default 1
);

alter table public.tester_heartbeat enable row level security;
-- No direct policies: the app writes through the function below.

create or replace function public.tester_beat(p_tester text, p_build integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.tester_heartbeat (tester_id, build_code)
  values (p_tester, p_build)
  on conflict (tester_id) do update
    set build_code = excluded.build_code,
        last_seen  = now(),
        sessions   = public.tester_heartbeat.sessions + 1;
$$;

grant execute on function public.tester_beat(text, integer) to anon, authenticated;

-- Who is actually using it, and who is stuck on an old build:
-- select tester_id, build_code, last_seen, sessions
-- from public.tester_heartbeat order by last_seen desc;
