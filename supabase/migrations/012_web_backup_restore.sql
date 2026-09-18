-- DormPlus 012: Web Backup / Restore center
-- Adds application-level project snapshots that can be created/restored from DormPlus UI.
-- Backups are stored in a private Supabase Storage bucket and are managed only by server routes.
-- This is an application data backup, not a replacement for Supabase platform/PITR backups.

begin;

insert into public.permission_catalog(permission_key,module_key,module_label,permission_label,description,sort_order)
values
  ('backup.view','backup','Backup / Restore','ดู Backup','ดูประวัติและดาวน์โหลด application backup ของโครงการ',130),
  ('backup.manage','backup','Backup / Restore','จัดการ Backup / Restore','สร้าง ลบ และ restore snapshot ของโครงการ',131)
on conflict(permission_key) do update set
  module_key=excluded.module_key,
  module_label=excluded.module_label,
  permission_label=excluded.permission_label,
  description=excluded.description,
  sort_order=excluded.sort_order;

-- Owner receives all catalog permissions dynamically. Existing custom roles can be
-- granted backup.view / backup.manage from the Role UI after this migration.

create table if not exists public.backup_snapshots (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  status text not null default 'ready' check(status in ('creating','ready','restoring','failed')),
  backup_type text not null default 'application' check(backup_type in ('application')),
  storage_path text,
  include_files boolean not null default false,
  data_bytes bigint not null default 0,
  file_count int not null default 0,
  table_counts jsonb not null default '{}'::jsonb,
  note text,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  restored_by uuid references public.profiles(id) on delete set null,
  restored_at timestamptz
);

create index if not exists idx_backup_snapshots_property_created
  on public.backup_snapshots(property_id, created_at desc);

alter table public.backup_snapshots enable row level security;

drop policy if exists "backup_snapshots_permission_select" on public.backup_snapshots;
create policy "backup_snapshots_permission_select"
on public.backup_snapshots for select
using (public.has_property_permission(property_id,'backup.view'));

-- Mutations go through server-side API using service_role only.
revoke insert, update, delete on public.backup_snapshots from anon, authenticated;
grant select on public.backup_snapshots to authenticated;
grant all on public.backup_snapshots to service_role;

insert into storage.buckets(id,name,public,file_size_limit)
values('dormplus-backups','dormplus-backups',false,52428800)
on conflict(id) do update set public=false;

-- Browser clients never access backup objects directly. Server routes stream files
-- after checking project permission.
drop policy if exists "dormplus_backups_authenticated_select" on storage.objects;
drop policy if exists "dormplus_backups_authenticated_insert" on storage.objects;
drop policy if exists "dormplus_backups_authenticated_update" on storage.objects;
drop policy if exists "dormplus_backups_authenticated_delete" on storage.objects;

commit;
