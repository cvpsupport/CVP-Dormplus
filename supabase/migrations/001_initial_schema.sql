-- DormPlus initial schema for Supabase
create extension if not exists "pgcrypto";

create type public.member_role as enum ('owner','manager','accountant','staff','technician');
create type public.room_status as enum ('vacant','occupied','reserved','maintenance','inactive');
create type public.contract_status as enum ('draft','active','expired','terminated');
create type public.invoice_status as enum ('draft','issued','partially_paid','paid','overdue','cancelled');
create type public.payment_status as enum ('pending','verified','rejected','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  timezone text not null default 'Asia/Bangkok',
  billing_day int not null default 25 check (billing_day between 1 and 28),
  due_day int not null default 5 check (due_day between 1 and 28),
  electricity_rate numeric(10,2) not null default 8,
  water_rate numeric(10,2) not null default 20,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_members (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique(property_id,user_id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_number text not null,
  floor_number int,
  monthly_rent numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,
  size_sqm numeric(8,2),
  status public.room_status not null default 'vacant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id,room_number)
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid references public.profiles(id),
  full_name text not null,
  phone text,
  email text,
  national_id text,
  emergency_contact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid not null references public.rooms(id),
  tenant_id uuid not null references public.tenants(id),
  contract_number text not null,
  start_date date not null,
  end_date date,
  rent_amount numeric(12,2) not null,
  deposit_amount numeric(12,2) not null default 0,
  billing_day int not null default 25,
  due_day int not null default 5,
  status public.contract_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id,contract_number)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  contract_id uuid not null references public.contracts(id),
  invoice_number text not null,
  billing_period date not null,
  issue_date date not null default current_date,
  due_date date not null,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status public.invoice_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id,invoice_number)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_type text not null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid references public.tenants(id),
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text not null default 'bank_transfer',
  status public.payment_status not null default 'pending',
  slip_path text,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique(payment_id,invoice_id)
);

create table public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id uuid references public.rooms(id),
  tenant_id uuid references public.tenants(id),
  title text not null,
  description text,
  priority text not null default 'medium',
  status text not null default 'open',
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index idx_property_members_user on public.property_members(user_id);
create index idx_rooms_property on public.rooms(property_id);
create index idx_tenants_property on public.tenants(property_id);
create index idx_contracts_property on public.contracts(property_id);
create index idx_invoices_property on public.invoices(property_id);
create index idx_payments_property on public.payments(property_id);
create index idx_maintenance_property on public.maintenance_tickets(property_id);

-- Helper function for RLS
create or replace function public.is_property_member(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.property_members pm
    where pm.property_id = p_property_id
      and pm.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.property_members enable row level security;
alter table public.rooms enable row level security;
alter table public.tenants enable row level security;
alter table public.contracts enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.maintenance_tickets enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_self_select" on public.profiles for select using (id = auth.uid());
create policy "profiles_self_update" on public.profiles for update using (id = auth.uid());
create policy "properties_member_select" on public.properties for select using (public.is_property_member(id));
create policy "property_members_member_select" on public.property_members for select using (public.is_property_member(property_id));
create policy "rooms_member_all" on public.rooms for all using (public.is_property_member(property_id)) with check (public.is_property_member(property_id));
create policy "tenants_member_all" on public.tenants for all using (public.is_property_member(property_id)) with check (public.is_property_member(property_id));
create policy "contracts_member_all" on public.contracts for all using (public.is_property_member(property_id)) with check (public.is_property_member(property_id));
create policy "invoices_member_all" on public.invoices for all using (public.is_property_member(property_id)) with check (public.is_property_member(property_id));
create policy "payments_member_all" on public.payments for all using (public.is_property_member(property_id)) with check (public.is_property_member(property_id));
create policy "maintenance_member_all" on public.maintenance_tickets for all using (public.is_property_member(property_id)) with check (public.is_property_member(property_id));
create policy "audit_member_select" on public.audit_logs for select using (public.is_property_member(property_id));

-- Child-table policies based on parent ownership
create policy "invoice_items_member_all" on public.invoice_items for all
using (exists(select 1 from public.invoices i where i.id = invoice_id and public.is_property_member(i.property_id)))
with check (exists(select 1 from public.invoices i where i.id = invoice_id and public.is_property_member(i.property_id)));

create policy "payment_allocations_member_all" on public.payment_allocations for all
using (exists(select 1 from public.payments p where p.id = payment_id and public.is_property_member(p.property_id)))
with check (exists(select 1 from public.payments p where p.id = payment_id and public.is_property_member(p.property_id)));

-- Create a profile automatically when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
