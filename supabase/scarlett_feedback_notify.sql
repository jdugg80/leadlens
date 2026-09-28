-- Run in the SCARLETT project (dlntgyhfxxbcwwcxaorn) SQL editor -- NOT the LeadLens project.
-- Adds email-on-new-feedback. Order: deploy the notify-feedback function first, then run this.

-- 1. one column so each feedback row can be emailed at most once
alter table public.feedback_reports add column if not exists notified_at timestamptz;

-- 2. everything that exists today is history: mark it so only NEW feedback triggers an email
update public.feedback_reports set notified_at = now() where notified_at is null;

-- 3. async HTTP from the database (a no-op if it is already enabled)
create extension if not exists pg_net with schema extensions;

-- 4. trigger function: tells the Edge Function "row <id> exists". It can never block or roll back
--    the insert: pg_net queues the request, and any error here is swallowed.
create or replace function public.notify_new_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net
as $$
begin
  begin
    perform net.http_post(
      url := 'https://dlntgyhfxxbcwwcxaorn.supabase.co/functions/v1/notify-feedback',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  exception when others then
    null; -- a notification problem must never cost a tester their feedback
  end;
  return new;
end;
$$;

drop trigger if exists notify_new_feedback on public.feedback_reports;
create trigger notify_new_feedback
  after insert on public.feedback_reports
  for each row execute function public.notify_new_feedback();
