-- LensSignal Active Monitoring & Alerting Automation
-- Requires: pg_net extension for HTTP requests to Edge Functions

-- 1. Create the Trigger Function
create or replace function fn_notify_on_high_value_signal()
returns trigger as $$
declare
  is_high_value boolean := false;
  edge_func_url text;
  anon_key text;
begin
  -- Identify high-value signals: Pest, New Opening, or Priority Review
  if (new.has_pest_indicator = true) then
    is_high_value := true;
  elsif (new.is_new_opening = true) then
    is_high_value := true;
  elsif (new.alert_level in ('red', 'Priority Review')) then
    is_high_value := true;
  end if;

  -- If high value, call the send-push-alert Edge Function
  if (is_high_value) then
    -- Retrieve project configuration from internal vault or hardcode if necessary
    -- For Edge Functions, we typically use the service role key or a specific secret
    edge_func_url := 'https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/send-push-alert';

    -- Using pg_net to make the async HTTP request
    -- We pass the signal data in the body
    perform net.http_post(
      url := edge_func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('request.headers')::json->>'authorization'
      ),
      body := jsonb_build_object('signal', row_to_json(new))
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- 2. Attach the Trigger to lens_signals
drop trigger if exists tr_high_value_signal_alert on lens_signals;
create trigger tr_high_value_signal_alert
after insert on lens_signals
for each row
execute function fn_notify_on_high_value_signal();

-- 3. Notification Tracking Cleanup (Optional: Auto-delete notifications older than 30 days)
create or replace function fn_cleanup_old_notifications()
returns void as $$
begin
  delete from lenssignal_notifications where sent_at < now() - interval '30 days';
end;
$$ language plpgsql;
