-- DormPlus 004: Legacy import support
-- Safe to run after 001_initial_schema.sql, 002_projects_module.sql, 003_crud_support.sql.
-- This migration preserves legacy dormitory data without forcing uncertain historical billing
-- into the canonical payment ledger.

begin;

alter table public.tenants
  add column if not exists employee_code text,
  add column if not exists department text,
  add column if not exists nationality text,
  add column if not exists legacy_key text,
  add column if not exists legacy_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists tenants_property_legacy_key_unique
  on public.tenants(property_id, legacy_key)
  where legacy_key is not null;

alter table public.rooms
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.contracts
  add column if not exists legacy_start_date_unknown boolean not null default false,
  add column if not exists legacy_deposit_unknown boolean not null default false,
  add column if not exists legacy_source jsonb not null default '{}'::jsonb;

alter table public.properties
  add column if not exists water_minimum_charge numeric(12,2) not null default 0,
  add column if not exists water_service_fee numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'meter_type'
  ) then
    create type public.meter_type as enum ('water','electricity');
  end if;
end
$$;

create table if not exists public.meters (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  meter_type public.meter_type not null,
  label text,
  serial_number text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meters_property_room_type_unique
  on public.meters(property_id, room_id, meter_type);

create index if not exists idx_meters_property
  on public.meters(property_id);

create table if not exists public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  meter_id uuid not null references public.meters(id) on delete cascade,
  billing_period date not null,
  previous_reading numeric(14,2),
  current_reading numeric(14,2),
  usage numeric(14,2),
  rate numeric(12,4),
  amount numeric(12,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists meter_readings_meter_period_unique
  on public.meter_readings(meter_id, billing_period);

create index if not exists idx_meter_readings_property_period
  on public.meter_readings(property_id, billing_period);

create table if not exists public.legacy_billing_snapshots (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  billing_period date not null,
  rent_amount numeric(12,2) not null default 0,
  water_previous numeric(14,2),
  water_current numeric(14,2),
  water_usage numeric(14,2),
  water_amount numeric(12,2),
  electricity_previous numeric(14,2),
  electricity_current numeric(14,2),
  electricity_usage numeric(14,2),
  electricity_rate numeric(12,4),
  electricity_amount numeric(12,2),
  other_charge numeric(12,2) not null default 0,
  total_due numeric(12,2) not null default 0,
  source_sheet text,
  source_row int,
  raw_group text,
  note text,
  review_flag text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists legacy_billing_property_room_period_unique
  on public.legacy_billing_snapshots(property_id, room_id, billing_period);

create index if not exists idx_legacy_billing_property_period
  on public.legacy_billing_snapshots(property_id, billing_period);

create table if not exists public.legacy_tenant_history (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  legacy_key text not null,
  inferred_building text,
  room_number text,
  full_name text not null,
  raw_group text,
  rent_amount numeric(12,2),
  water_previous numeric(14,2),
  water_current numeric(14,2),
  water_usage numeric(14,2),
  water_amount numeric(12,2),
  electricity_previous numeric(14,2),
  electricity_current numeric(14,2),
  electricity_usage numeric(14,2),
  electricity_amount numeric(12,2),
  other_charge numeric(12,2),
  total_due numeric(12,2),
  source_sheet text,
  source_row int,
  note text,
  mapping_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists legacy_tenant_history_key_unique
  on public.legacy_tenant_history(property_id, legacy_key);

create table if not exists public.legacy_import_issues (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  issue_key text not null,
  billing_period date,
  severity text not null default 'medium',
  category text not null,
  entity text,
  finding text not null,
  recommendation text,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists legacy_import_issues_key_unique
  on public.legacy_import_issues(property_id, issue_key);

create index if not exists idx_legacy_import_issues_property_status
  on public.legacy_import_issues(property_id, status);

alter table public.meters enable row level security;
alter table public.meter_readings enable row level security;
alter table public.legacy_billing_snapshots enable row level security;
alter table public.legacy_tenant_history enable row level security;
alter table public.legacy_import_issues enable row level security;

drop policy if exists "meters_member_all" on public.meters;
create policy "meters_member_all"
on public.meters
for all
using (public.is_property_member(property_id))
with check (public.is_property_member(property_id));

drop policy if exists "meter_readings_member_all" on public.meter_readings;
create policy "meter_readings_member_all"
on public.meter_readings
for all
using (public.is_property_member(property_id))
with check (public.is_property_member(property_id));

drop policy if exists "legacy_billing_member_all" on public.legacy_billing_snapshots;
create policy "legacy_billing_member_all"
on public.legacy_billing_snapshots
for all
using (public.is_property_member(property_id))
with check (public.is_property_member(property_id));

drop policy if exists "legacy_history_member_all" on public.legacy_tenant_history;
create policy "legacy_history_member_all"
on public.legacy_tenant_history
for all
using (public.is_property_member(property_id))
with check (public.is_property_member(property_id));

drop policy if exists "legacy_issues_member_all" on public.legacy_import_issues;
create policy "legacy_issues_member_all"
on public.legacy_import_issues
for all
using (public.is_property_member(property_id))
with check (public.is_property_member(property_id));

grant select, insert, update, delete on public.meters to authenticated;
grant select, insert, update, delete on public.meter_readings to authenticated;
grant select, insert, update, delete on public.legacy_billing_snapshots to authenticated;
grant select, insert, update, delete on public.legacy_tenant_history to authenticated;
grant select, insert, update, delete on public.legacy_import_issues to authenticated;

commit;
