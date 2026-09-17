-- DormPlus 008: Discord slash-command meter capture (/water, /electric)
-- Adds channel -> project/building mapping, OCR submission audit, image evidence fields,
-- and a private Supabase Storage bucket for meter photos.

begin;

alter table public.meter_readings
  add column if not exists source text not null default 'manual',
  add column if not exists source_reference text,
  add column if not exists image_path text,
  add column if not exists ocr_confidence numeric(5,4),
  add column if not exists review_status text not null default 'verified',
  add column if not exists verified_at timestamptz;

create index if not exists idx_meter_readings_source_reference
  on public.meter_readings(source_reference)
  where source_reference is not null;

create table if not exists public.discord_meter_channels (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  guild_id text not null,
  channel_id text not null,
  enabled boolean not null default true,
  auto_save_confidence numeric(5,4) not null default 0.9800
    check (auto_save_confidence >= 0 and auto_save_confidence <= 1),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(guild_id, channel_id)
);

create index if not exists idx_discord_meter_channels_property
  on public.discord_meter_channels(property_id);

create table if not exists public.discord_meter_submissions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  meter_id uuid references public.meters(id) on delete set null,
  meter_type public.meter_type not null,
  billing_period date,
  discord_interaction_id text not null unique,
  guild_id text,
  channel_id text,
  discord_user_id text,
  discord_username text,
  attachment_id text,
  attachment_filename text,
  image_path text,
  ocr_reading numeric(14,2),
  ocr_confidence numeric(5,4),
  previous_reading numeric(14,2),
  usage numeric(14,2),
  rate numeric(12,4),
  amount numeric(12,2),
  status text not null default 'processing'
    check (status in ('processing','saved','review','failed')),
  review_reason text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_discord_meter_submissions_property_created
  on public.discord_meter_submissions(property_id, created_at desc);
create index if not exists idx_discord_meter_submissions_status
  on public.discord_meter_submissions(property_id, status, created_at desc);

alter table public.discord_meter_channels enable row level security;
alter table public.discord_meter_submissions enable row level security;

drop policy if exists "discord_meter_channels_member_select" on public.discord_meter_channels;
create policy "discord_meter_channels_member_select"
on public.discord_meter_channels
for select using (public.is_property_member(property_id));

drop policy if exists "discord_meter_channels_owner_mutate" on public.discord_meter_channels;
create policy "discord_meter_channels_owner_mutate"
on public.discord_meter_channels
for all using (public.is_property_owner(property_id))
with check (public.is_property_owner(property_id));

drop policy if exists "discord_meter_submissions_member_select" on public.discord_meter_submissions;
create policy "discord_meter_submissions_member_select"
on public.discord_meter_submissions
for select using (public.is_property_member(property_id));

grant select, insert, update, delete on public.discord_meter_channels to authenticated;
grant select on public.discord_meter_submissions to authenticated;

-- Server-side uploads only. Browser access should use signed URLs in a future review UI.
insert into storage.buckets(id, name, public)
values ('meter-photos', 'meter-photos', false)
on conflict (id) do update set public = false;

commit;
