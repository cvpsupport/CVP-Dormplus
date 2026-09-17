-- CRUD support: safe archival for operational entities and owner project deletion.

alter table public.rooms add column if not exists archived_at timestamptz;
alter table public.tenants add column if not exists archived_at timestamptz;

create index if not exists idx_rooms_property_active on public.rooms(property_id) where archived_at is null;
create index if not exists idx_tenants_property_active on public.tenants(property_id) where archived_at is null;

-- Project creation is still performed through create_project(). Owners may delete a project.
drop policy if exists "properties_owner_delete" on public.properties;
create policy "properties_owner_delete" on public.properties for delete
using (public.is_property_owner(id));
