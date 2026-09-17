-- DormPlus 006: Split the June-2026 legacy import into 3 independent projects.
-- Mapping requested by owner:
--   หอเก่า      -> โครงการ1
--   หอใน        -> โครงการ2
--   หน้าโรงงาน  -> โครงการ3
--
-- Run after 005_import_legacy_june_2026.sql and before 007_meter_notifications.sql.
-- This migration is intentionally conservative: if it finds project-level data
-- that cannot be mapped automatically, it aborts instead of deleting it.

begin;

create temp table _split_ctx (
  source_property_id uuid not null,
  owner_id uuid not null
) on commit drop;

do $$
declare
  v_source uuid;
  v_owner uuid;
  v_tasks int;
  v_docs int;
begin
  select id into v_source
  from public.properties
  where code = 'CVP-LEGACY-202606'
  order by created_at desc
  limit 1;

  if v_source is null then
    raise exception 'ไม่พบโครงการต้นทาง code=CVP-LEGACY-202606';
  end if;

  select pm.user_id into v_owner
  from public.property_members pm
  where pm.property_id = v_source
    and pm.role = 'owner'
  order by pm.created_at
  limit 1;

  if v_owner is null then
    raise exception 'ไม่พบ owner ของโครงการต้นทาง';
  end if;

  select count(*) into v_tasks from public.project_tasks where property_id = v_source;
  select count(*) into v_docs from public.project_documents where property_id = v_source;

  if v_tasks > 0 or v_docs > 0 then
    raise exception 'พบ project-level data ที่ยังแบ่งอัตโนมัติไม่ได้: project_tasks=% project_documents=%', v_tasks, v_docs;
  end if;

  insert into _split_ctx values(v_source, v_owner);
end
$$;

create temp table _project_map (
  legacy_building text primary key,
  project_name text not null,
  project_code text not null,
  target_property_id uuid
) on commit drop;

insert into _project_map(legacy_building, project_name, project_code)
values
  ('หอเก่า',     'โครงการ1', 'CVP-PROJECT-1'),
  ('หอใน',       'โครงการ2', 'CVP-PROJECT-2'),
  ('หน้าโรงงาน', 'โครงการ3', 'CVP-PROJECT-3');

-- Create target projects and copy project settings.
do $$
declare
  rec record;
  v_target uuid;
  v_source uuid;
  v_owner uuid;
begin
  select source_property_id, owner_id into v_source, v_owner from _split_ctx limit 1;

  for rec in select * from _project_map order by project_code loop
    select p.id into v_target
    from public.properties p
    where p.created_by = v_owner and p.code = rec.project_code
    limit 1;

    if v_target is null then
      insert into public.properties(
        name, phone, address, timezone, billing_day, due_day,
        electricity_rate, water_rate, water_minimum_charge, water_service_fee,
        created_by, code, project_type, status, description,
        manager_id, cover_image_path, opened_at, metadata
      )
      select
        rec.project_name, s.phone, s.address, s.timezone, s.billing_day, s.due_day,
        s.electricity_rate, s.water_rate, s.water_minimum_charge, s.water_service_fee,
        v_owner, rec.project_code, s.project_type, 'active'::public.project_status,
        'แยกจากข้อมูลระบบเดิม: ' || rec.legacy_building,
        s.manager_id, s.cover_image_path, s.opened_at,
        coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
          'legacy_split','2026-06',
          'legacy_building',rec.legacy_building,
          'source_project_code','CVP-LEGACY-202606'
        )
      from public.properties s where s.id = v_source
      returning id into v_target;
    else
      update public.properties
      set name = rec.project_name,
          status = 'active',
          description = 'แยกจากข้อมูลระบบเดิม: ' || rec.legacy_building,
          metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
            'legacy_split','2026-06',
            'legacy_building',rec.legacy_building,
            'source_project_code','CVP-LEGACY-202606'
          ),
          updated_at = now()
      where id = v_target;
    end if;

    update _project_map set target_property_id = v_target where legacy_building = rec.legacy_building;
  end loop;
end
$$;

-- Copy every membership to the three projects.
insert into public.property_members(property_id, user_id, role)
select m.target_property_id, pm.user_id, pm.role
from _project_map m
cross join _split_ctx c
join public.property_members pm on pm.property_id = c.source_property_id
on conflict(property_id, user_id) do update set role = excluded.role;

-- Move the imported building records first.
update public.buildings b
set property_id = m.target_property_id,
    updated_at = now()
from _project_map m, _split_ctx c
where b.property_id = c.source_property_id
  and b.name = m.legacy_building;

-- Move rooms according to their building.
update public.rooms r
set property_id = b.property_id,
    updated_at = now(),
    metadata = coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object('split_project_id',b.property_id)
from public.buildings b
join _project_map m on m.target_property_id = b.property_id
cross join _split_ctx c
where r.property_id = c.source_property_id
  and r.building_id = b.id;

-- Move current tenants by their imported active contract -> room.
update public.tenants t
set property_id = r.property_id,
    updated_at = now(),
    legacy_metadata = coalesce(t.legacy_metadata,'{}'::jsonb) || jsonb_build_object('split_project_id',r.property_id)
from public.contracts ct
join public.rooms r on r.id = ct.room_id
cross join _split_ctx c
where t.property_id = c.source_property_id
  and ct.tenant_id = t.id
  and ct.status = 'active'
  and t.legacy_key like '2026-06|%';

-- Contracts follow room.
update public.contracts ct
set property_id = r.property_id,
    updated_at = now(),
    legacy_source = coalesce(ct.legacy_source,'{}'::jsonb) || jsonb_build_object('split_project_id',r.property_id)
from public.rooms r, _split_ctx c
where ct.property_id = c.source_property_id
  and ct.room_id = r.id;

-- Canonical invoices/payments/maintenance created after import follow their related records.
update public.invoices i
set property_id = ct.property_id,
    updated_at = now()
from public.contracts ct, _split_ctx c
where i.property_id = c.source_property_id
  and i.contract_id = ct.id;

update public.payments p
set property_id = t.property_id
from public.tenants t, _split_ctx c
where p.property_id = c.source_property_id
  and p.tenant_id = t.id;

update public.maintenance_tickets mt
set property_id = r.property_id,
    updated_at = now()
from public.rooms r, _split_ctx c
where mt.property_id = c.source_property_id
  and mt.room_id = r.id;

update public.maintenance_tickets mt
set property_id = t.property_id,
    updated_at = now()
from public.tenants t, _split_ctx c
where mt.property_id = c.source_property_id
  and mt.room_id is null
  and mt.tenant_id = t.id;

-- Meter and legacy billing data follow room.
update public.meters mtr
set property_id = r.property_id,
    updated_at = now()
from public.rooms r, _split_ctx c
where mtr.property_id = c.source_property_id
  and mtr.room_id = r.id;

update public.meter_readings mr
set property_id = r.property_id
from public.rooms r, _split_ctx c
where mr.property_id = c.source_property_id
  and mr.room_id = r.id;

update public.legacy_billing_snapshots lb
set property_id = r.property_id
from public.rooms r, _split_ctx c
where lb.property_id = c.source_property_id
  and lb.room_id = r.id;

-- Historical residents already have inferred_building.
update public.legacy_tenant_history lh
set property_id = m.target_property_id,
    metadata = coalesce(lh.metadata,'{}'::jsonb) || jsonb_build_object('split_to_project',m.project_name)
from _project_map m, _split_ctx c
where lh.property_id = c.source_property_id
  and lh.inferred_building = m.legacy_building;

-- Move project-specific review issues and copy global issues to all three projects.
create temp table _source_issues on commit drop as
select li.*
from public.legacy_import_issues li
cross join _split_ctx c
where li.property_id = c.source_property_id;

delete from public.legacy_import_issues li
using _split_ctx c
where li.property_id = c.source_property_id;

insert into public.legacy_import_issues(
  property_id, issue_key, billing_period, severity, category, entity,
  finding, recommendation, status, metadata, created_at, resolved_at
)
select
  m.target_property_id, si.issue_key, si.billing_period, si.severity, si.category, si.entity,
  si.finding, si.recommendation, si.status,
  coalesce(si.metadata,'{}'::jsonb) || jsonb_build_object('split_to_project',m.project_name),
  si.created_at, si.resolved_at
from _source_issues si
join _project_map m on si.entity like '%' || m.legacy_building || '%'
on conflict(property_id, issue_key) do update set
  severity=excluded.severity, category=excluded.category, entity=excluded.entity,
  finding=excluded.finding, recommendation=excluded.recommendation, status=excluded.status,
  metadata=excluded.metadata, resolved_at=excluded.resolved_at;

insert into public.legacy_import_issues(
  property_id, issue_key, billing_period, severity, category, entity,
  finding, recommendation, status, metadata, created_at, resolved_at
)
select
  m.target_property_id, si.issue_key, si.billing_period, si.severity, si.category, si.entity,
  si.finding, si.recommendation, si.status,
  coalesce(si.metadata,'{}'::jsonb) || jsonb_build_object('split_to_project',m.project_name,'global_issue',true),
  si.created_at, si.resolved_at
from _source_issues si
cross join _project_map m
where not exists (
  select 1 from _project_map bx where si.entity like '%' || bx.legacy_building || '%'
)
on conflict(property_id, issue_key) do update set
  severity=excluded.severity, category=excluded.category, entity=excluded.entity,
  finding=excluded.finding, recommendation=excluded.recommendation, status=excluded.status,
  metadata=excluded.metadata, resolved_at=excluded.resolved_at;

-- Preserve audit history in each new project.
insert into public.audit_logs(property_id, actor_id, action, entity_type, entity_id, old_data, new_data, created_at)
select
  m.target_property_id, a.actor_id, a.action || '_SPLIT', a.entity_type, a.entity_id,
  a.old_data,
  coalesce(a.new_data,'{}'::jsonb) || jsonb_build_object('split_to_project',m.project_name,'legacy_building',m.legacy_building),
  a.created_at
from public.audit_logs a
cross join _project_map m
cross join _split_ctx c
where a.property_id = c.source_property_id;

insert into public.audit_logs(property_id, actor_id, action, entity_type, entity_id, new_data)
select
  m.target_property_id, c.owner_id, 'SPLIT_LEGACY_PROJECT', 'property', m.target_property_id::text,
  jsonb_build_object('source_project_code','CVP-LEGACY-202606','legacy_building',m.legacy_building,'project_name',m.project_name)
from _project_map m cross join _split_ctx c;

-- Verify imported counts by new project before removing the combined project.
do $$
declare
  rec record;
  v_rooms int;
  v_tenants int;
  v_contracts int;
  v_readings int;
  v_snapshots int;
  v_history int;
begin
  for rec in
    select * from (values
      ('CVP-PROJECT-1',45,31,31,90,45,12),
      ('CVP-PROJECT-2',39,36,36,78,39,12),
      ('CVP-PROJECT-3',26,19,19,52,26,8)
    ) as x(code,rooms,tenants,contracts,readings,snapshots,history)
  loop
    select count(*) into v_rooms from public.rooms r join public.properties p on p.id=r.property_id where p.code=rec.code and r.metadata->>'legacy_import'='2026-06';
    select count(*) into v_tenants from public.tenants t join public.properties p on p.id=t.property_id where p.code=rec.code and t.legacy_key like '2026-06|%';
    select count(*) into v_contracts from public.contracts ct join public.properties p on p.id=ct.property_id where p.code=rec.code and ct.legacy_source->>'legacy_import'='2026-06';
    select count(*) into v_readings from public.meter_readings mr join public.properties p on p.id=mr.property_id where p.code=rec.code and mr.billing_period=date '2026-06-01' and mr.metadata->>'legacy_import'='2026-06';
    select count(*) into v_snapshots from public.legacy_billing_snapshots lb join public.properties p on p.id=lb.property_id where p.code=rec.code and lb.billing_period=date '2026-06-01';
    select count(*) into v_history from public.legacy_tenant_history lh join public.properties p on p.id=lh.property_id where p.code=rec.code and lh.legacy_key like '2026-06-history|%';

    if v_rooms<>rec.rooms or v_tenants<>rec.tenants or v_contracts<>rec.contracts or v_readings<>rec.readings or v_snapshots<>rec.snapshots or v_history<>rec.history then
      raise exception 'ตรวจสอบ % ไม่ผ่าน rooms=%/% tenants=%/% contracts=%/% readings=%/% snapshots=%/% history=%/%',
        rec.code,v_rooms,rec.rooms,v_tenants,rec.tenants,v_contracts,rec.contracts,v_readings,rec.readings,v_snapshots,rec.snapshots,v_history,rec.history;
    end if;
  end loop;
end
$$;

-- Abort rather than silently cascade-delete any unmapped operational rows.
do $$
declare
  v_source uuid;
  v_left int;
begin
  select source_property_id into v_source from _split_ctx limit 1;

  select
    (select count(*) from public.buildings where property_id=v_source) +
    (select count(*) from public.rooms where property_id=v_source) +
    (select count(*) from public.tenants where property_id=v_source) +
    (select count(*) from public.contracts where property_id=v_source) +
    (select count(*) from public.invoices where property_id=v_source) +
    (select count(*) from public.payments where property_id=v_source) +
    (select count(*) from public.maintenance_tickets where property_id=v_source) +
    (select count(*) from public.meters where property_id=v_source) +
    (select count(*) from public.meter_readings where property_id=v_source) +
    (select count(*) from public.legacy_billing_snapshots where property_id=v_source) +
    (select count(*) from public.legacy_tenant_history where property_id=v_source) +
    (select count(*) from public.legacy_import_issues where property_id=v_source)
  into v_left;

  if v_left <> 0 then
    raise exception 'ยังมีข้อมูลที่ไม่ได้ map อยู่ในโครงการต้นทางจำนวน % รายการ จึงยังไม่ลบโครงการต้นทาง', v_left;
  end if;
end
$$;

-- Delete only the empty combined container. Membership/audit rows cascade here.
delete from public.properties p
using _split_ctx c
where p.id = c.source_property_id;

commit;

-- Verification
select
  p.code,
  p.name,
  (select count(*) from public.rooms r where r.property_id=p.id and r.archived_at is null) as rooms,
  (select count(*) from public.tenants t where t.property_id=p.id and t.archived_at is null) as tenants,
  (select count(*) from public.contracts c where c.property_id=p.id and c.status='active') as active_contracts,
  (select count(*) from public.meter_readings mr where mr.property_id=p.id and mr.billing_period=date '2026-06-01') as meter_readings,
  (select count(*) from public.legacy_billing_snapshots lb where lb.property_id=p.id and lb.billing_period=date '2026-06-01') as billing_snapshots,
  (select count(*) from public.legacy_tenant_history lh where lh.property_id=p.id) as history
from public.properties p
where p.code in ('CVP-PROJECT-1','CVP-PROJECT-2','CVP-PROJECT-3')
order by p.code;
