-- DormPlus project/portfolio module
-- In DormPlus a project is represented by a property. This migration enriches
-- properties with portfolio fields and adds building + project task entities.

create type public.project_status as enum ('planning','active','renovation','inactive');
create type public.project_type as enum ('dormitory','apartment','student_apartment','serviced_apartment','other');
create type public.project_task_status as enum ('todo','in_progress','blocked','done','cancelled');
create type public.project_task_priority as enum ('low','medium','high','urgent');

alter table public.properties
  add column if not exists code text,
  add column if not exists project_type public.project_type not null default 'dormitory',
  add column if not exists status public.project_status not null default 'active',
  add column if not exists description text,
  add column if not exists manager_id uuid references public.profiles(id),
  add column if not exists cover_image_path text,
  add column if not exists opened_at date,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists properties_creator_code_unique
  on public.properties(created_by, code)
  where code is not null;

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  code text,
  floor_count int not null default 1 check (floor_count > 0),
  status text not null default 'active',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, name)
);

alter table public.rooms
  add column if not exists building_id uuid references public.buildings(id) on delete set null;

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  description text,
  status public.project_task_status not null default 'todo',
  priority public.project_task_priority not null default 'medium',
  due_date date,
  assigned_to uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  document_type text not null default 'other',
  storage_path text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_buildings_property on public.buildings(property_id);
create index if not exists idx_project_tasks_property on public.project_tasks(property_id);
create index if not exists idx_project_tasks_due on public.project_tasks(property_id, due_date);
create index if not exists idx_project_documents_property on public.project_documents(property_id);
create index if not exists idx_rooms_building on public.rooms(building_id);

alter table public.buildings enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_documents enable row level security;

create policy "buildings_member_all" on public.buildings for all
using (public.is_property_member(property_id))
with check (public.is_property_member(property_id));

create policy "project_tasks_member_all" on public.project_tasks for all
using (public.is_property_member(property_id))
with check (public.is_property_member(property_id));

create policy "project_documents_member_all" on public.project_documents for all
using (public.is_property_member(property_id))
with check (public.is_property_member(property_id));


-- Owner helper used by project-level mutations.
create or replace function public.is_property_owner(p_property_id uuid)
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
      and pm.role = 'owner'
  );
$$;

-- Create a project and its owner membership atomically. This avoids the
-- chicken-and-egg problem where RLS requires membership before a property exists.
create or replace function public.create_project(
  p_name text,
  p_code text default null,
  p_project_type public.project_type default 'dormitory',
  p_address text default null,
  p_phone text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.properties (
    name, code, project_type, address, phone, description, created_by
  ) values (
    p_name, nullif(trim(p_code), ''), p_project_type, p_address, p_phone, p_description, auth.uid()
  )
  returning id into v_property_id;

  insert into public.property_members (property_id, user_id, role)
  values (v_property_id, auth.uid(), 'owner');

  return v_property_id;
end;
$$;

grant execute on function public.create_project(text,text,public.project_type,text,text,text) to authenticated;

create policy "properties_owner_update" on public.properties for update
using (public.is_property_owner(id))
with check (public.is_property_owner(id));
