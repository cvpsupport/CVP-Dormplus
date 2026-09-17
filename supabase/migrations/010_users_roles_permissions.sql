-- DormPlus 010: Users, custom roles and granular permissions
-- Adds project-scoped RBAC that can be managed from the web UI.
-- Run after 009_discord_manual_meter_approval.sql.

begin;

alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is null or p.email <> u.email);

create unique index if not exists profiles_email_unique_ci
  on public.profiles(lower(email))
  where email is not null;

create table if not exists public.permission_catalog (
  permission_key text primary key,
  module_key text not null,
  module_label text not null,
  permission_label text not null,
  description text,
  sort_order int not null default 0
);

create table if not exists public.property_roles (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  role_key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id, role_key)
);

create unique index if not exists property_roles_name_unique_ci
  on public.property_roles(property_id, lower(name));

create table if not exists public.property_role_permissions (
  role_id uuid not null references public.property_roles(id) on delete cascade,
  permission_key text not null references public.permission_catalog(permission_key) on delete cascade,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(role_id, permission_key)
);

alter table public.property_members
  add column if not exists role_id uuid references public.property_roles(id) on delete restrict;

create index if not exists idx_property_members_role_id on public.property_members(role_id);
create index if not exists idx_property_roles_property on public.property_roles(property_id);
create index if not exists idx_role_permissions_role on public.property_role_permissions(role_id);

insert into public.permission_catalog(permission_key,module_key,module_label,permission_label,description,sort_order)
values
  ('dashboard.view','dashboard','หน้าหลัก','ดู Dashboard','ดูภาพรวมและ KPI ของโครงการ',10),
  ('projects.view','projects','โครงการ','ดูโครงการ','ดูข้อมูลโครงการและอาคาร',20),
  ('projects.manage','projects','โครงการ','จัดการโครงการ/อาคาร','เพิ่ม แก้ไข และจัดการข้อมูลโครงการหรืออาคาร',21),
  ('rooms.view','rooms','ห้องพัก','ดูห้องพัก','ดูรายการและรายละเอียดห้อง',30),
  ('rooms.create','rooms','ห้องพัก','เพิ่มห้อง','สร้างห้องใหม่',31),
  ('rooms.update','rooms','ห้องพัก','แก้ไขห้อง','แก้ไขสถานะ ราคา และข้อมูลห้อง',32),
  ('rooms.delete','rooms','ห้องพัก','ลบ/ปิดห้อง','นำห้องออกจากรายการใช้งาน',33),
  ('tenants.view','tenants','ผู้เช่า','ดูผู้เช่า','ดูข้อมูลผู้เช่าและสัญญา',40),
  ('tenants.create','tenants','ผู้เช่า','เพิ่มผู้เช่า','เพิ่มผู้เช่าและสัญญา',41),
  ('tenants.update','tenants','ผู้เช่า','แก้ไขผู้เช่า','แก้ไขผู้เช่าและสัญญา',42),
  ('tenants.delete','tenants','ผู้เช่า','ลบ/ย้ายออกผู้เช่า','Archive ผู้เช่าจากรายการปัจจุบัน',43),
  ('billing.view','billing','การเงิน','ดูการเงิน','ดูใบแจ้งหนี้และการชำระ',50),
  ('billing.create','billing','การเงิน','สร้างรายการการเงิน','สร้างใบแจ้งหนี้/รายการรับชำระ',51),
  ('billing.update','billing','การเงิน','แก้ไขรายการการเงิน','แก้ไขใบแจ้งหนี้และข้อมูลการเงิน',52),
  ('billing.delete','billing','การเงิน','ยกเลิกรายการการเงิน','ยกเลิกหรือลบรายการที่อนุญาต',53),
  ('billing.verify','billing','การเงิน','ยืนยันการชำระ','ตรวจและยืนยันการรับชำระ',54),
  ('maintenance.view','maintenance','แจ้งซ่อม','ดูงานแจ้งซ่อม','ดู Ticket งานซ่อม',60),
  ('maintenance.create','maintenance','แจ้งซ่อม','สร้างงานแจ้งซ่อม','เพิ่ม Ticket งานซ่อม',61),
  ('maintenance.update','maintenance','แจ้งซ่อม','อัปเดตงานแจ้งซ่อม','แก้ไขสถานะและรายละเอียดงาน',62),
  ('maintenance.delete','maintenance','แจ้งซ่อม','ลบงานแจ้งซ่อม','ลบ Ticket ที่ไม่ต้องการ',63),
  ('maintenance.assign','maintenance','แจ้งซ่อม','มอบหมายช่าง','กำหนดผู้รับผิดชอบงานซ่อม',64),
  ('meters.view','meters','มิเตอร์น้ำ / ไฟ','ดูมิเตอร์','ดูมิเตอร์และประวัติการจด',70),
  ('meters.record','meters','มิเตอร์น้ำ / ไฟ','จดมิเตอร์','เพิ่มหรือแก้ไขเลขมิเตอร์',71),
  ('meters.approve','meters','มิเตอร์น้ำ / ไฟ','อนุมัติมิเตอร์','อนุมัติเลขมิเตอร์ที่ส่งจาก Discord',72),
  ('notifications.view','notifications','แจ้งเตือน','ดูแจ้งเตือน','ดูศูนย์แจ้งเตือน',80),
  ('notifications.manage','notifications','แจ้งเตือน','ตั้งค่าการแจ้งเตือน','แก้ไขกฎและช่องทางแจ้งเตือน',81),
  ('users.view','users','ผู้ใช้งาน','ดูผู้ใช้งาน','ดูสมาชิกและ Role ในโครงการ',90),
  ('users.manage','users','ผู้ใช้งาน','จัดการผู้ใช้งาน','เพิ่ม แก้ไข Role และนำผู้ใช้ออกจากโครงการ',91),
  ('roles.view','roles','Role และสิทธิ์','ดู Role และสิทธิ์','ดูชุดสิทธิ์ของโครงการ',100),
  ('roles.manage','roles','Role และสิทธิ์','จัดการ Role และสิทธิ์','สร้าง แก้ไข ลบ Role และกำหนด Permission',101),
  ('settings.view','settings','ตั้งค่าระบบ','ดูการตั้งค่า','ดูค่าระบบของโครงการ',110),
  ('settings.manage','settings','ตั้งค่าระบบ','แก้ไขการตั้งค่า','แก้ไขรอบบิล ค่าน้ำไฟ และ Integration',111),
  ('audit.view','audit','Audit Log','ดู Audit Log','ดูประวัติการเปลี่ยนแปลงที่สำคัญ',120)
on conflict(permission_key) do update set
  module_key=excluded.module_key,
  module_label=excluded.module_label,
  permission_label=excluded.permission_label,
  description=excluded.description,
  sort_order=excluded.sort_order;

create or replace function public.seed_property_access_defaults(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_manager uuid;
  v_accountant uuid;
  v_staff uuid;
  v_technician uuid;
begin
  insert into public.property_roles(property_id,role_key,name,description,is_system)
  values
    (p_property_id,'owner','Owner','เจ้าของโครงการ — สิทธิ์ทั้งหมด',true),
    (p_property_id,'manager','Manager','ผู้จัดการโครงการ — จัดการงานประจำวันและผู้ใช้งาน',true),
    (p_property_id,'accountant','Accountant','ฝ่ายการเงิน — ใบแจ้งหนี้ การชำระ และรายงานการเงิน',true),
    (p_property_id,'staff','Staff','เจ้าหน้าที่ — ห้อง ผู้เช่า มิเตอร์ และงานแจ้งซ่อม',true),
    (p_property_id,'technician','Technician','ช่าง — งานแจ้งซ่อมและจดมิเตอร์',true)
  on conflict(property_id,role_key) do update set
    name=excluded.name,
    description=excluded.description,
    is_system=true,
    updated_at=now();

  select id into v_owner from public.property_roles where property_id=p_property_id and role_key='owner';
  select id into v_manager from public.property_roles where property_id=p_property_id and role_key='manager';
  select id into v_accountant from public.property_roles where property_id=p_property_id and role_key='accountant';
  select id into v_staff from public.property_roles where property_id=p_property_id and role_key='staff';
  select id into v_technician from public.property_roles where property_id=p_property_id and role_key='technician';

  -- Owner always receives every current/future catalog permission when this seed is called.
  insert into public.property_role_permissions(role_id,permission_key,allowed)
  select v_owner, pc.permission_key, true
  from public.permission_catalog pc
  on conflict(role_id,permission_key) do update set allowed=true;

  -- Manager: everything operational including users/settings, but Role design remains Owner controlled by default.
  insert into public.property_role_permissions(role_id,permission_key,allowed)
  select v_manager, pc.permission_key, true
  from public.permission_catalog pc
  where pc.permission_key <> 'roles.manage'
  on conflict(role_id,permission_key) do nothing;

  insert into public.property_role_permissions(role_id,permission_key,allowed)
  select v_accountant, x.permission_key, true
  from (values
    ('dashboard.view'),('projects.view'),('rooms.view'),('tenants.view'),
    ('billing.view'),('billing.create'),('billing.update'),('billing.verify'),
    ('meters.view'),('notifications.view'),('settings.view')
  ) x(permission_key)
  on conflict(role_id,permission_key) do nothing;

  insert into public.property_role_permissions(role_id,permission_key,allowed)
  select v_staff, x.permission_key, true
  from (values
    ('dashboard.view'),('projects.view'),
    ('rooms.view'),('rooms.create'),('rooms.update'),
    ('tenants.view'),('tenants.create'),('tenants.update'),
    ('maintenance.view'),('maintenance.create'),('maintenance.update'),('maintenance.assign'),
    ('meters.view'),('meters.record'),('notifications.view'),('settings.view')
  ) x(permission_key)
  on conflict(role_id,permission_key) do nothing;

  insert into public.property_role_permissions(role_id,permission_key,allowed)
  select v_technician, x.permission_key, true
  from (values
    ('dashboard.view'),('projects.view'),('rooms.view'),
    ('maintenance.view'),('maintenance.update'),
    ('meters.view'),('meters.record'),('notifications.view')
  ) x(permission_key)
  on conflict(role_id,permission_key) do nothing;
end;
$$;

-- Seed all existing projects.
do $$
declare r record;
begin
  for r in select id from public.properties loop
    perform public.seed_property_access_defaults(r.id);
  end loop;
end
$$;

create or replace function public.handle_property_access_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_property_access_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists on_property_access_defaults on public.properties;
create trigger on_property_access_defaults
after insert on public.properties
for each row execute procedure public.handle_property_access_defaults();

create or replace function public.sync_property_member_role_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if new.role_id is null then
    select pr.id into new.role_id
    from public.property_roles pr
    where pr.property_id=new.property_id
      and pr.role_key=new.role::text
    limit 1;
  else
    select pr.role_key into v_key
    from public.property_roles pr
    where pr.id=new.role_id
      and pr.property_id=new.property_id;

    if v_key is null then
      raise exception 'Role does not belong to this property';
    end if;

    if v_key in ('owner','manager','accountant','staff','technician') then
      new.role = v_key::public.member_role;
    else
      -- Backward-compatible enum fallback. Granular access is controlled by role_id.
      new.role = 'staff'::public.member_role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists before_property_member_role_sync on public.property_members;
create trigger before_property_member_role_sync
before insert or update of property_id,role,role_id on public.property_members
for each row execute procedure public.sync_property_member_role_id();

update public.property_members pm
set role_id = pr.id
from public.property_roles pr
where pm.role_id is null
  and pr.property_id=pm.property_id
  and pr.role_key=pm.role::text;

create or replace function public.has_property_permission(p_property_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.property_members pm
    where pm.property_id = p_property_id
      and pm.user_id = auth.uid()
      and (
        pm.role = 'owner'::public.member_role
        or exists (
          select 1
          from public.property_roles pr
          join public.property_role_permissions rperm on rperm.role_id=pr.id
          where pr.id=pm.role_id
            and pr.property_id=pm.property_id
            and rperm.permission_key=p_permission_key
            and rperm.allowed=true
        )
      )
  );
$$;

grant execute on function public.has_property_permission(uuid,text) to authenticated;

create or replace function public.get_my_property_permissions(p_property_id uuid)
returns table(permission_key text)
language sql
stable
security definer
set search_path = public
as $$
  select pc.permission_key
  from public.permission_catalog pc
  where exists (
    select 1
    from public.property_members pm
    where pm.property_id=p_property_id
      and pm.user_id=auth.uid()
      and (
        pm.role='owner'::public.member_role
        or exists (
          select 1
          from public.property_role_permissions rp
          where rp.role_id=pm.role_id
            and rp.permission_key=pc.permission_key
            and rp.allowed=true
        )
      )
  )
  order by pc.sort_order, pc.permission_key;
$$;

grant execute on function public.get_my_property_permissions(uuid) to authenticated;

create or replace function public.get_my_property_role(p_property_id uuid)
returns table(role_id uuid, role_key text, role_name text, is_owner boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id,
    coalesce(pr.role_key, pm.role::text),
    coalesce(pr.name, initcap(pm.role::text)),
    (pm.role='owner'::public.member_role)
  from public.property_members pm
  left join public.property_roles pr on pr.id=pm.role_id
  where pm.property_id=p_property_id
    and pm.user_id=auth.uid()
  limit 1;
$$;

grant execute on function public.get_my_property_role(uuid) to authenticated;

alter table public.permission_catalog enable row level security;
alter table public.property_roles enable row level security;
alter table public.property_role_permissions enable row level security;

drop policy if exists "permission_catalog_authenticated_select" on public.permission_catalog;
create policy "permission_catalog_authenticated_select"
on public.permission_catalog for select
to authenticated
using (true);

drop policy if exists "property_roles_member_select" on public.property_roles;
create policy "property_roles_member_select"
on public.property_roles for select
using (public.is_property_member(property_id));

drop policy if exists "property_roles_permission_mutate" on public.property_roles;
create policy "property_roles_permission_mutate"
on public.property_roles for all
using (public.has_property_permission(property_id,'roles.manage'))
with check (public.has_property_permission(property_id,'roles.manage'));

drop policy if exists "role_permissions_member_select" on public.property_role_permissions;
create policy "role_permissions_member_select"
on public.property_role_permissions for select
using (exists(
  select 1 from public.property_roles pr
  where pr.id=role_id and public.is_property_member(pr.property_id)
));

drop policy if exists "role_permissions_permission_mutate" on public.property_role_permissions;
create policy "role_permissions_permission_mutate"
on public.property_role_permissions for all
using (exists(
  select 1 from public.property_roles pr
  where pr.id=role_id and public.has_property_permission(pr.property_id,'roles.manage')
))
with check (exists(
  select 1 from public.property_roles pr
  where pr.id=role_id and public.has_property_permission(pr.property_id,'roles.manage')
));

grant select on public.permission_catalog to authenticated;
grant select,insert,update,delete on public.property_roles to authenticated;
grant select,insert,update,delete on public.property_role_permissions to authenticated;

-- Property member list is readable to self or to users with users.view.
drop policy if exists "property_members_member_select" on public.property_members;
create policy "property_members_member_select"
on public.property_members for select
using (
  user_id=auth.uid()
  or public.has_property_permission(property_id,'users.view')
);

-- Core operational RLS now uses granular permissions. Owner is always allowed by helper.
drop policy if exists "rooms_member_all" on public.rooms;
drop policy if exists "rooms_permission_select" on public.rooms;
drop policy if exists "rooms_permission_insert" on public.rooms;
drop policy if exists "rooms_permission_update" on public.rooms;
drop policy if exists "rooms_permission_delete" on public.rooms;
create policy "rooms_permission_select" on public.rooms for select using (public.has_property_permission(property_id,'rooms.view'));
create policy "rooms_permission_insert" on public.rooms for insert with check (public.has_property_permission(property_id,'rooms.create'));
create policy "rooms_permission_update" on public.rooms for update using (public.has_property_permission(property_id,'rooms.update')) with check (public.has_property_permission(property_id,'rooms.update'));
create policy "rooms_permission_delete" on public.rooms for delete using (public.has_property_permission(property_id,'rooms.delete'));

drop policy if exists "tenants_member_all" on public.tenants;
drop policy if exists "tenants_permission_select" on public.tenants;
drop policy if exists "tenants_permission_insert" on public.tenants;
drop policy if exists "tenants_permission_update" on public.tenants;
drop policy if exists "tenants_permission_delete" on public.tenants;
create policy "tenants_permission_select" on public.tenants for select using (public.has_property_permission(property_id,'tenants.view'));
create policy "tenants_permission_insert" on public.tenants for insert with check (public.has_property_permission(property_id,'tenants.create'));
create policy "tenants_permission_update" on public.tenants for update using (public.has_property_permission(property_id,'tenants.update')) with check (public.has_property_permission(property_id,'tenants.update'));
create policy "tenants_permission_delete" on public.tenants for delete using (public.has_property_permission(property_id,'tenants.delete'));

drop policy if exists "contracts_member_all" on public.contracts;
drop policy if exists "contracts_permission_select" on public.contracts;
drop policy if exists "contracts_permission_insert" on public.contracts;
drop policy if exists "contracts_permission_update" on public.contracts;
drop policy if exists "contracts_permission_delete" on public.contracts;
create policy "contracts_permission_select" on public.contracts for select using (public.has_property_permission(property_id,'tenants.view'));
create policy "contracts_permission_insert" on public.contracts for insert with check (public.has_property_permission(property_id,'tenants.create'));
create policy "contracts_permission_update" on public.contracts for update using (public.has_property_permission(property_id,'tenants.update')) with check (public.has_property_permission(property_id,'tenants.update'));
create policy "contracts_permission_delete" on public.contracts for delete using (public.has_property_permission(property_id,'tenants.delete'));

drop policy if exists "invoices_member_all" on public.invoices;
drop policy if exists "invoices_permission_select" on public.invoices;
drop policy if exists "invoices_permission_insert" on public.invoices;
drop policy if exists "invoices_permission_update" on public.invoices;
drop policy if exists "invoices_permission_delete" on public.invoices;
create policy "invoices_permission_select" on public.invoices for select using (public.has_property_permission(property_id,'billing.view'));
create policy "invoices_permission_insert" on public.invoices for insert with check (public.has_property_permission(property_id,'billing.create'));
create policy "invoices_permission_update" on public.invoices for update using (public.has_property_permission(property_id,'billing.update')) with check (public.has_property_permission(property_id,'billing.update'));
create policy "invoices_permission_delete" on public.invoices for delete using (public.has_property_permission(property_id,'billing.delete'));

drop policy if exists "payments_member_all" on public.payments;
drop policy if exists "payments_permission_select" on public.payments;
drop policy if exists "payments_permission_insert" on public.payments;
drop policy if exists "payments_permission_update" on public.payments;
drop policy if exists "payments_permission_delete" on public.payments;
create policy "payments_permission_select" on public.payments for select using (public.has_property_permission(property_id,'billing.view'));
create policy "payments_permission_insert" on public.payments for insert with check (public.has_property_permission(property_id,'billing.create'));
create policy "payments_permission_update" on public.payments for update using (public.has_property_permission(property_id,'billing.update') or public.has_property_permission(property_id,'billing.verify')) with check (public.has_property_permission(property_id,'billing.update') or public.has_property_permission(property_id,'billing.verify'));
create policy "payments_permission_delete" on public.payments for delete using (public.has_property_permission(property_id,'billing.delete'));

drop policy if exists "maintenance_member_all" on public.maintenance_tickets;
drop policy if exists "maintenance_permission_select" on public.maintenance_tickets;
drop policy if exists "maintenance_permission_insert" on public.maintenance_tickets;
drop policy if exists "maintenance_permission_update" on public.maintenance_tickets;
drop policy if exists "maintenance_permission_delete" on public.maintenance_tickets;
create policy "maintenance_permission_select" on public.maintenance_tickets for select using (public.has_property_permission(property_id,'maintenance.view'));
create policy "maintenance_permission_insert" on public.maintenance_tickets for insert with check (public.has_property_permission(property_id,'maintenance.create'));
create policy "maintenance_permission_update" on public.maintenance_tickets for update using (public.has_property_permission(property_id,'maintenance.update')) with check (public.has_property_permission(property_id,'maintenance.update'));
create policy "maintenance_permission_delete" on public.maintenance_tickets for delete using (public.has_property_permission(property_id,'maintenance.delete'));

-- Buildings remain visible to project members because room/meter filters depend on them.
drop policy if exists "buildings_member_all" on public.buildings;
drop policy if exists "buildings_member_select" on public.buildings;
drop policy if exists "buildings_manage_insert" on public.buildings;
drop policy if exists "buildings_manage_update" on public.buildings;
drop policy if exists "buildings_manage_delete" on public.buildings;
create policy "buildings_member_select" on public.buildings for select using (public.is_property_member(property_id));
create policy "buildings_manage_insert" on public.buildings for insert with check (public.has_property_permission(property_id,'projects.manage'));
create policy "buildings_manage_update" on public.buildings for update using (public.has_property_permission(property_id,'projects.manage')) with check (public.has_property_permission(property_id,'projects.manage'));
create policy "buildings_manage_delete" on public.buildings for delete using (public.has_property_permission(property_id,'projects.manage'));

-- Meter tables were created by 004.
drop policy if exists "meters_member_all" on public.meters;
drop policy if exists "meters_permission_select" on public.meters;
drop policy if exists "meters_permission_insert" on public.meters;
drop policy if exists "meters_permission_update" on public.meters;
drop policy if exists "meters_permission_delete" on public.meters;
create policy "meters_permission_select" on public.meters for select using (public.has_property_permission(property_id,'meters.view'));
create policy "meters_permission_insert" on public.meters for insert with check (public.has_property_permission(property_id,'meters.record'));
create policy "meters_permission_update" on public.meters for update using (public.has_property_permission(property_id,'meters.record')) with check (public.has_property_permission(property_id,'meters.record'));
create policy "meters_permission_delete" on public.meters for delete using (public.has_property_permission(property_id,'meters.record'));

drop policy if exists "meter_readings_member_all" on public.meter_readings;
drop policy if exists "meter_readings_permission_select" on public.meter_readings;
drop policy if exists "meter_readings_permission_insert" on public.meter_readings;
drop policy if exists "meter_readings_permission_update" on public.meter_readings;
drop policy if exists "meter_readings_permission_delete" on public.meter_readings;
create policy "meter_readings_permission_select" on public.meter_readings for select using (public.has_property_permission(property_id,'meters.view'));
create policy "meter_readings_permission_insert" on public.meter_readings for insert with check (public.has_property_permission(property_id,'meters.record'));
create policy "meter_readings_permission_update" on public.meter_readings for update using (public.has_property_permission(property_id,'meters.record')) with check (public.has_property_permission(property_id,'meters.record'));
create policy "meter_readings_permission_delete" on public.meter_readings for delete using (public.has_property_permission(property_id,'meters.record'));

-- Project settings and notification configuration.
drop policy if exists "properties_owner_update" on public.properties;
drop policy if exists "properties_permission_update" on public.properties;
create policy "properties_permission_update" on public.properties for update
using (public.has_property_permission(id,'settings.manage') or public.has_property_permission(id,'projects.manage'))
with check (public.has_property_permission(id,'settings.manage') or public.has_property_permission(id,'projects.manage'));

drop policy if exists "notification_channels_owner_mutate" on public.notification_channels;
drop policy if exists "notification_channels_permission_mutate" on public.notification_channels;
create policy "notification_channels_permission_mutate" on public.notification_channels for all
using (public.has_property_permission(property_id,'notifications.manage'))
with check (public.has_property_permission(property_id,'notifications.manage'));

drop policy if exists "notification_rules_owner_mutate" on public.notification_rules;
drop policy if exists "notification_rules_permission_mutate" on public.notification_rules;
create policy "notification_rules_permission_mutate" on public.notification_rules for all
using (public.has_property_permission(property_id,'notifications.manage'))
with check (public.has_property_permission(property_id,'notifications.manage'));

drop policy if exists "discord_meter_channels_owner_mutate" on public.discord_meter_channels;
drop policy if exists "discord_meter_channels_permission_mutate" on public.discord_meter_channels;
create policy "discord_meter_channels_permission_mutate" on public.discord_meter_channels for all
using (public.has_property_permission(property_id,'settings.manage'))
with check (public.has_property_permission(property_id,'settings.manage'));

drop policy if exists "discord_meter_submissions_member_select" on public.discord_meter_submissions;
drop policy if exists "discord_meter_submissions_permission_select" on public.discord_meter_submissions;
create policy "discord_meter_submissions_permission_select" on public.discord_meter_submissions for select
using (public.has_property_permission(property_id,'meters.view'));

-- Notification center visibility.
drop policy if exists "notifications_member_select" on public.notifications;
drop policy if exists "notifications_permission_select" on public.notifications;
create policy "notifications_permission_select" on public.notifications for select
using (
  public.has_property_permission(property_id,'notifications.view')
  and (user_id is null or user_id=auth.uid())
);

drop policy if exists "notifications_member_update" on public.notifications;
drop policy if exists "notifications_permission_update" on public.notifications;
create policy "notifications_permission_update" on public.notifications for update
using (
  public.has_property_permission(property_id,'notifications.view')
  and (user_id is null or user_id=auth.uid())
)
with check (
  public.has_property_permission(property_id,'notifications.view')
  and (user_id is null or user_id=auth.uid())
);


-- Child finance tables follow billing permissions through their parent records.
drop policy if exists "invoice_items_member_all" on public.invoice_items;
drop policy if exists "invoice_items_permission_all" on public.invoice_items;
create policy "invoice_items_permission_all" on public.invoice_items for all
using (exists(
  select 1 from public.invoices i
  where i.id=invoice_id and public.has_property_permission(i.property_id,'billing.view')
))
with check (exists(
  select 1 from public.invoices i
  where i.id=invoice_id and (
    public.has_property_permission(i.property_id,'billing.create')
    or public.has_property_permission(i.property_id,'billing.update')
  )
));

drop policy if exists "payment_allocations_member_all" on public.payment_allocations;
drop policy if exists "payment_allocations_permission_all" on public.payment_allocations;
create policy "payment_allocations_permission_all" on public.payment_allocations for all
using (exists(
  select 1 from public.payments p
  where p.id=payment_id and public.has_property_permission(p.property_id,'billing.view')
))
with check (exists(
  select 1 from public.payments p
  where p.id=payment_id and (
    public.has_property_permission(p.property_id,'billing.create')
    or public.has_property_permission(p.property_id,'billing.update')
    or public.has_property_permission(p.property_id,'billing.verify')
  )
));

-- Project work/document tables.
drop policy if exists "project_tasks_member_all" on public.project_tasks;
drop policy if exists "project_tasks_permission_select" on public.project_tasks;
drop policy if exists "project_tasks_permission_mutate" on public.project_tasks;
create policy "project_tasks_permission_select" on public.project_tasks for select using (public.has_property_permission(property_id,'projects.view'));
create policy "project_tasks_permission_mutate" on public.project_tasks for all
using (public.has_property_permission(property_id,'projects.manage'))
with check (public.has_property_permission(property_id,'projects.manage'));

drop policy if exists "project_documents_member_all" on public.project_documents;
drop policy if exists "project_documents_permission_select" on public.project_documents;
drop policy if exists "project_documents_permission_mutate" on public.project_documents;
create policy "project_documents_permission_select" on public.project_documents for select using (public.has_property_permission(property_id,'projects.view'));
create policy "project_documents_permission_mutate" on public.project_documents for all
using (public.has_property_permission(property_id,'projects.manage'))
with check (public.has_property_permission(property_id,'projects.manage'));

-- Audit / historical imported data.
drop policy if exists "audit_member_select" on public.audit_logs;
drop policy if exists "audit_permission_select" on public.audit_logs;
create policy "audit_permission_select" on public.audit_logs for select using (public.has_property_permission(property_id,'audit.view'));

drop policy if exists "legacy_billing_member_all" on public.legacy_billing_snapshots;
drop policy if exists "legacy_billing_permission_select" on public.legacy_billing_snapshots;
create policy "legacy_billing_permission_select" on public.legacy_billing_snapshots for select using (public.has_property_permission(property_id,'billing.view'));

drop policy if exists "legacy_history_member_all" on public.legacy_tenant_history;
drop policy if exists "legacy_history_permission_select" on public.legacy_tenant_history;
create policy "legacy_history_permission_select" on public.legacy_tenant_history for select using (public.has_property_permission(property_id,'tenants.view'));

drop policy if exists "legacy_issues_member_all" on public.legacy_import_issues;
drop policy if exists "legacy_issues_permission_select" on public.legacy_import_issues;
create policy "legacy_issues_permission_select" on public.legacy_import_issues for select using (
  public.has_property_permission(property_id,'audit.view')
  or public.has_property_permission(property_id,'billing.view')
);

-- Notification configuration reads also respect notification permissions.
drop policy if exists "notification_channels_member_select" on public.notification_channels;
drop policy if exists "notification_channels_permission_select" on public.notification_channels;
create policy "notification_channels_permission_select" on public.notification_channels for select
using (public.has_property_permission(property_id,'notifications.view') or public.has_property_permission(property_id,'notifications.manage'));

drop policy if exists "notification_rules_member_select" on public.notification_rules;
drop policy if exists "notification_rules_permission_select" on public.notification_rules;
create policy "notification_rules_permission_select" on public.notification_rules for select
using (public.has_property_permission(property_id,'notifications.view') or public.has_property_permission(property_id,'notifications.manage'));

drop policy if exists "delivery_logs_member_select" on public.notification_delivery_logs;
drop policy if exists "delivery_logs_permission_select" on public.notification_delivery_logs;
create policy "delivery_logs_permission_select" on public.notification_delivery_logs for select
using (public.has_property_permission(property_id,'notifications.view'));

drop policy if exists "discord_meter_channels_member_select" on public.discord_meter_channels;
drop policy if exists "discord_meter_channels_permission_select" on public.discord_meter_channels;
create policy "discord_meter_channels_permission_select" on public.discord_meter_channels for select
using (public.has_property_permission(property_id,'settings.view') or public.has_property_permission(property_id,'settings.manage'));

commit;
