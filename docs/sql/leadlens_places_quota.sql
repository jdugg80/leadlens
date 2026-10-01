-- Run in the LEADLENS Supabase project (qkbvwryucaakkkqaqvka) ONLY.
-- Do NOT run this in Project Scarlett.

create table if not exists public.places_usage (
  user_id text not null,                                   -- auth user id, or device id fallback
  day     date not null default ((now() at time zone 'utc')::date),
  calls   integer not null default 0,
  primary key (user_id, day)
);

alter table public.places_usage enable row level security;
-- No policies on purpose: only the service role (the Edge Function) touches this table.

-- Atomically counts a call and returns true if the user is still under the cap.
-- Over-cap attempts are still counted, so you can see who keeps hitting the limit.
create or replace function public.places_take_quota(p_user text, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls integer;
begin
  insert into public.places_usage (user_id, day, calls)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day)
  do update set calls = places_usage.calls + 1
  returning calls into v_calls;

  return v_calls <= p_cap;
end;
$$;

revoke all on function public.places_take_quota(text, integer) from public, anon, authenticated;
grant execute on function public.places_take_quota(text, integer) to service_role;

-- Handy query: who is using the most Places calls over the last 14 days
-- select user_id, sum(calls) as total, max(day) as last_day
-- from public.places_usage
-- where day >= (now() at time zone 'utc')::date - 14
-- group by user_id order by total desc;
