-- DormPlus 007: Meter UI support + notification center + channel configuration.
-- External secrets are stored in a service-role-only table and are never selectable by authenticated clients.

begin;

-- Meter operational metadata.
alter table public.properties
  add column if not exists meter_high_usage_water numeric(12,2) not null default 30,
  add column if not exists meter_high_usage_electricity numeric(12,2) not null default 300;

-- Notification channel metadata. No tokens/webhooks are stored here.
create table if not exists public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  channel text not null check (channel in ('inapp','line','discord','telegram')),
  enabled boolean not null default false,
  label text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, channel)
);

-- Server-only secrets. There are intentionally no authenticated policies.
create table if not exists public.notification_channel_secrets (
  channel_id uuid primary key references public.notification_channels(id) on delete cascade,
  secret jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  event_key text not null,
  enabled boolean not null default true,
  channels text[] not null default array['inapp']::text[],
  days_before int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, event_key)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  event_key text not null default 'general',
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','error')),
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_delivery_logs (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  channel text not null,
  event_key text not null,
  entity_type text,
  entity_id text,
  dedupe_key text,
  status text not null check (status in ('sent','failed','skipped')),
  response_text text,
  created_at timestamptz not null default now()
);

create unique index if not exists notification_delivery_dedupe_unique
  on public.notification_delivery_logs(property_id, channel, dedupe_key)
  where dedupe_key is not null and status = 'sent';
create index if not exists idx_notifications_property_created on public.notifications(property_id, created_at desc);
create index if not exists idx_notifications_user_unread on public.notifications(user_id, read_at) where read_at is null;
create index if not exists idx_notification_rules_property on public.notification_rules(property_id);
create index if not exists idx_delivery_logs_property_created on public.notification_delivery_logs(property_id, created_at desc);

alter table public.notification_channels enable row level security;
alter table public.notification_channel_secrets enable row level security;
alter table public.notification_rules enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_delivery_logs enable row level security;

drop policy if exists "notification_channels_member_select" on public.notification_channels;
create policy "notification_channels_member_select" on public.notification_channels
for select using (public.is_property_member(property_id));

drop policy if exists "notification_channels_owner_mutate" on public.notification_channels;
create policy "notification_channels_owner_mutate" on public.notification_channels
for all using (public.is_property_owner(property_id))
with check (public.is_property_owner(property_id));

drop policy if exists "notification_rules_member_select" on public.notification_rules;
create policy "notification_rules_member_select" on public.notification_rules
for select using (public.is_property_member(property_id));

drop policy if exists "notification_rules_owner_mutate" on public.notification_rules;
create policy "notification_rules_owner_mutate" on public.notification_rules
for all using (public.is_property_owner(property_id))
with check (public.is_property_owner(property_id));

drop policy if exists "notifications_member_select" on public.notifications;
create policy "notifications_member_select" on public.notifications
for select using (
  public.is_property_member(property_id)
  and (user_id is null or user_id = auth.uid())
);

drop policy if exists "notifications_member_update" on public.notifications;
create policy "notifications_member_update" on public.notifications
for update using (
  public.is_property_member(property_id)
  and (user_id is null or user_id = auth.uid())
) with check (
  public.is_property_member(property_id)
  and (user_id is null or user_id = auth.uid())
);

drop policy if exists "delivery_logs_member_select" on public.notification_delivery_logs;
create policy "delivery_logs_member_select" on public.notification_delivery_logs
for select using (public.is_property_member(property_id));

-- Explicitly keep channel secrets server-only.
revoke all on table public.notification_channel_secrets from anon, authenticated;
grant all on table public.notification_channel_secrets to service_role;

-- Normal app tables.
grant select, insert, update, delete on public.notification_channels to authenticated;
grant select, insert, update, delete on public.notification_rules to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.notification_delivery_logs to authenticated;

-- Seed defaults for existing projects.
insert into public.notification_channels(property_id, channel, enabled, label)
select p.id, 'inapp', true, 'In-App'
from public.properties p
on conflict(property_id, channel) do nothing;

insert into public.notification_channels(property_id, channel, enabled, label)
select p.id, x.channel, false, x.label
from public.properties p
cross join (values
  ('line','LINE Official Account'),
  ('discord','Discord'),
  ('telegram','Telegram')
) x(channel,label)
on conflict(property_id, channel) do nothing;

insert into public.notification_rules(property_id, event_key, enabled, channels, days_before)
select p.id, x.event_key, true, array['inapp']::text[], x.days_before
from public.properties p
cross join (values
  ('invoice_due',3),
  ('payment_received',0),
  ('maintenance_new',0),
  ('contract_expiring',30),
  ('meter_anomaly',0)
) x(event_key, days_before)
on conflict(property_id, event_key) do nothing;

-- New projects automatically get channel/rule defaults.
create or replace function public.handle_notification_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_channels(property_id, channel, enabled, label)
  values
    (new.id,'inapp',true,'In-App'),
    (new.id,'line',false,'LINE Official Account'),
    (new.id,'discord',false,'Discord'),
    (new.id,'telegram',false,'Telegram')
  on conflict(property_id, channel) do nothing;

  insert into public.notification_rules(property_id, event_key, enabled, channels, days_before)
  values
    (new.id,'invoice_due',true,array['inapp']::text[],3),
    (new.id,'payment_received',true,array['inapp']::text[],0),
    (new.id,'maintenance_new',true,array['inapp']::text[],0),
    (new.id,'contract_expiring',true,array['inapp']::text[],30),
    (new.id,'meter_anomaly',true,array['inapp']::text[],0)
  on conflict(property_id, event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists on_property_notification_defaults on public.properties;
create trigger on_property_notification_defaults
after insert on public.properties
for each row execute procedure public.handle_notification_defaults();

commit;
