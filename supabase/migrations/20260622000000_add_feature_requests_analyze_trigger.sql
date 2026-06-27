-- Auto-triage trigger for feature_requests INSERT
-- Calls the analyze-submission edge function via pg_net
-- Requires: pg_net extension (enabled by default on Supabase)

-- 0. Ensure pg_net extension is available
create extension if not exists pg_net;

-- 1. Create the trigger function
create or replace function fn_analyze_submission_on_insert()
returns trigger as $$
declare
  edge_func_url text;
  service_role_key text;
begin
  -- Only fire for in-app submissions (the edge function double-checks, but
  -- this avoids unnecessary HTTP calls for owner/rep dashboard inserts).
  if NEW.source is distinct from 'in-app' then
    return NEW;
  end if;

  -- Build the edge function URL using the Supabase project ref from
  -- the current request host (works for PostgREST/Supabase API calls).
  -- Fallback: hardcode if triggers fire outside an HTTP context.
  begin
    edge_func_url := 'https://' || current_setting('request.headers')::json->>'host'
                     || '/functions/v1/analyze-submission';
  exception when others then
    -- Outside HTTP context (e.g. direct SQL insert), use hardcoded URL
    edge_func_url := 'https://qkbvwryucaakkkqaqvka.supabase.co/functions/v1/analyze-submission';
  end;

  -- Retrieve service role key from vault (Supabase secrets) or use a placeholder.
  -- In production, store the key with: select vault.create_secret('analyze Submission key', 'your-key');
  begin
    service_role_key := vault.get_secret('service_role_key');
  exception when others then
    -- Fallback: read from app.settings (set via ALTER DATABASE SET)
    service_role_key := current_setting('app.settings.service_role_key', true);
  end;

  -- Fire the HTTP request via pg_net (non-blocking)
  perform net.http_post(
    url := edge_func_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(service_role_key, ''),
      'apikey', coalesce(service_role_key, '')
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );

  return NEW;
end;
$$ language plpgsql security definer;

-- 2. Attach the trigger to feature_requests
drop trigger if exists tr_analyze_submission on feature_requests;
create trigger tr_analyze_submission
after insert on feature_requests
for each row
execute function fn_analyze_submission_on_insert();
