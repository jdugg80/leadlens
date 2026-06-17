-- Create outreach_messages table for tracking email/SMS sent status and delivery

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete set null,
  prospect_id text references public.prospects(id) on delete set null,
  business_name text,
  channel text check (channel in ('email','sms')),
  to_address text,
  subject text,
  body text,
  status text default 'pending' check (status in ('pending','sent','delivered','failed','opened','replied','opted_out')),
  provider_response jsonb,
  error_message text,
  sent_at timestamptz
);

-- Indexes for common lookups
create index if not exists idx_outreach_messages_user_id on outreach_messages(user_id);
create index if not exists idx_outreach_messages_prospect_id on outreach_messages(prospect_id);
create index if not exists idx_outreach_messages_status on outreach_messages(status);
create index if not exists idx_outreach_messages_created_at on outreach_messages(created_at desc);

-- Enable RLS
alter table public.outreach_messages enable row level security;

-- Users can only see their own outreach messages
create policy "Users can view own outreach messages"
  on public.outreach_messages for select
  using (auth.uid() = user_id);

-- Users can insert their own outreach messages
create policy "Users can insert own outreach messages"
  on public.outreach_messages for insert
  with check (auth.uid() = user_id);

-- Users can update their own outreach messages (delivery status updates)
create policy "Users can update own outreach messages"
  on public.outreach_messages for update
  using (auth.uid() = user_id);

-- Service role can manage all messages (for backend/webhook updates)
create policy "Service role can manage outreach messages"
  on public.outreach_messages for all
  using (auth.role() = 'service_role');
