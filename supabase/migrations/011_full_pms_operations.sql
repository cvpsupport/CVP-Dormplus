-- DormPlus 011: Full PMS operations
-- Billing periods, automatic invoicing, receipts, deposits, checkout,
-- expenses, documents, closing, tenant portal support and audit hardening.
-- Run after 010_users_roles_permissions.sql.

begin;

insert into public.permission_catalog(permission_key,module_key,module_label,permission_label,description,sort_order)
values
  ('periods.view','periods','รอบบิล','ดูรอบบิล','ดูรอบบิลและสถานะการปิดงวด',55),
  ('periods.manage','periods','รอบบิล','จัดการรอบบิล','สร้าง ออกบิล และปิดงวด',56),
  ('payments.view','payments','รับชำระ','ดูการรับชำระ','ดู payment และ receipt',57),
  ('payments.manage','payments','รับชำระ','จัดการรับชำระ','บันทึก ยืนยัน และจัดสรร payment',58),
  ('deposits.view','deposits','เงินประกัน','ดูเงินประกัน','ดู ledger เงินประกัน',59),
  ('deposits.manage','deposits','เงินประกัน','จัดการเงินประกัน','รับ คืน และหักเงินประกัน',60),
  ('checkout.view','checkout','ย้ายออก','ดูการย้ายออก','ดู workflow check-out',61),
  ('checkout.manage','checkout','ย้ายออก','จัดการย้ายออก','สร้างและปิดงาน check-out',62),
  ('expenses.view','expenses','ค่าใช้จ่าย','ดูค่าใช้จ่าย','ดูค่าใช้จ่ายของโครงการ',63),
  ('expenses.manage','expenses','ค่าใช้จ่าย','จัดการค่าใช้จ่าย','เพิ่ม แก้ไข และยกเลิกค่าใช้จ่าย',64),
  ('reports.view','reports','รายงาน','ดูรายงาน','ดูรายงานการเงินและการดำเนินงาน',65),
  ('documents.view','documents','เอกสาร','ดูเอกสาร','ดูเอกสารผู้เช่า/สัญญา/โครงการ',66),
  ('documents.manage','documents','เอกสาร','จัดการเอกสาร','เพิ่มและลบเอกสาร',67),
  ('portal.view','portal','Tenant Portal','ใช้ Tenant Portal','ผู้เช่าดูบิลและแจ้งซ่อมของตนเอง',68),
  ('data.view','data','นำเข้า / ส่งออก','ส่งออกข้อมูล','ส่งออกข้อมูลเป็น CSV ที่เปิดด้วย Excel ได้',69),
  ('data.manage','data','นำเข้า / ส่งออก','นำเข้าข้อมูล','นำเข้าห้องจาก CSV พร้อม validation',70)
on conflict(permission_key) do update set
  module_key=excluded.module_key,module_label=excluded.module_label,
  permission_label=excluded.permission_label,description=excluded.description,
  sort_order=excluded.sort_order;

-- Re-seed existing roles so Owner gets every new permission.
do $$ declare r record; begin
  for r in select id from public.properties loop
    perform public.seed_property_access_defaults(r.id);
  end loop;
end $$;

-- Extend finance-oriented defaults for existing Accountant roles.
insert into public.property_role_permissions(role_id,permission_key,allowed)
select pr.id, x.permission_key, true
from public.property_roles pr
cross join (values
 ('periods.view'),('payments.view'),('payments.manage'),('deposits.view'),('deposits.manage'),
 ('expenses.view'),('expenses.manage'),('reports.view'),('documents.view')
) x(permission_key)
where pr.role_key='accountant'
on conflict(role_id,permission_key) do update set allowed=true;

create table if not exists public.billing_periods (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  status text not null default 'open' check(status in ('open','meter_review','ready_to_bill','billed','closed')),
  billed_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(property_id,period_start)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  receipt_number text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now(),
  unique(property_id,receipt_number)
);

create table if not exists public.deposit_ledger (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entry_type text not null check(entry_type in ('received','deduction','refund','adjustment')),
  amount numeric(12,2) not null check(amount > 0),
  occurred_at timestamptz not null default now(),
  reference text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.checkout_cases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_id uuid not null references public.rooms(id),
  requested_date date not null default current_date,
  checkout_date date,
  status text not null default 'draft' check(status in ('draft','meter_pending','inspection','settlement','completed','cancelled')),
  final_water_reading numeric(14,2),
  final_electricity_reading numeric(14,2),
  damage_amount numeric(12,2) not null default 0,
  outstanding_amount numeric(12,2) not null default 0,
  deposit_refund_amount numeric(12,2) not null default 0,
  inspection_note text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(contract_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  category text not null default 'general',
  description text not null,
  amount numeric(12,2) not null check(amount >= 0),
  expense_date date not null default current_date,
  vendor text,
  receipt_path text,
  status text not null default 'posted' check(status in ('draft','posted','cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  document_type text not null default 'other',
  name text not null,
  storage_path text,
  external_url text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.payments
  add column if not exists reference_no text,
  add column if not exists note text;

alter table public.invoices
  add column if not exists billing_period_id uuid references public.billing_periods(id) on delete set null,
  add column if not exists closed_at timestamptz;

create index if not exists idx_billing_periods_property on public.billing_periods(property_id,period_start desc);
create index if not exists idx_receipts_property on public.receipts(property_id,issued_at desc);
create index if not exists idx_deposit_ledger_contract on public.deposit_ledger(contract_id,occurred_at);
create index if not exists idx_checkout_property on public.checkout_cases(property_id,status);
create index if not exists idx_expenses_property_date on public.expenses(property_id,expense_date desc);
create index if not exists idx_documents_property on public.documents(property_id,created_at desc);

alter table public.billing_periods enable row level security;
alter table public.receipts enable row level security;
alter table public.deposit_ledger enable row level security;
alter table public.checkout_cases enable row level security;
alter table public.expenses enable row level security;
alter table public.documents enable row level security;

drop policy if exists "periods_select" on public.billing_periods;
create policy "periods_select" on public.billing_periods for select using(public.has_property_permission(property_id,'periods.view') or public.has_property_permission(property_id,'billing.view'));
drop policy if exists "periods_manage" on public.billing_periods;
create policy "periods_manage" on public.billing_periods for all using(public.has_property_permission(property_id,'periods.manage')) with check(public.has_property_permission(property_id,'periods.manage'));

drop policy if exists "receipts_select" on public.receipts;
create policy "receipts_select" on public.receipts for select using(public.has_property_permission(property_id,'payments.view') or public.has_property_permission(property_id,'billing.view'));
drop policy if exists "receipts_manage" on public.receipts;
create policy "receipts_manage" on public.receipts for all using(public.has_property_permission(property_id,'payments.manage')) with check(public.has_property_permission(property_id,'payments.manage'));

drop policy if exists "deposit_select" on public.deposit_ledger;
create policy "deposit_select" on public.deposit_ledger for select using(public.has_property_permission(property_id,'deposits.view'));
drop policy if exists "deposit_manage" on public.deposit_ledger;
create policy "deposit_manage" on public.deposit_ledger for all using(public.has_property_permission(property_id,'deposits.manage')) with check(public.has_property_permission(property_id,'deposits.manage'));

drop policy if exists "checkout_select" on public.checkout_cases;
create policy "checkout_select" on public.checkout_cases for select using(public.has_property_permission(property_id,'checkout.view'));
drop policy if exists "checkout_manage" on public.checkout_cases;
create policy "checkout_manage" on public.checkout_cases for all using(public.has_property_permission(property_id,'checkout.manage')) with check(public.has_property_permission(property_id,'checkout.manage'));

drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses for select using(public.has_property_permission(property_id,'expenses.view'));
drop policy if exists "expenses_manage" on public.expenses;
create policy "expenses_manage" on public.expenses for all using(public.has_property_permission(property_id,'expenses.manage')) with check(public.has_property_permission(property_id,'expenses.manage'));

drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents for select using(public.has_property_permission(property_id,'documents.view'));
drop policy if exists "documents_manage" on public.documents;
create policy "documents_manage" on public.documents for all using(public.has_property_permission(property_id,'documents.manage')) with check(public.has_property_permission(property_id,'documents.manage'));

-- Auto-generate invoices for an open billing period.
create or replace function public.generate_invoices_for_period(p_period_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_period public.billing_periods%rowtype;
  v_count int := 0;
  rec record;
  v_invoice_id uuid;
  v_water numeric(12,2);
  v_electric numeric(12,2);
  v_total numeric(12,2);
begin
  select * into v_period from public.billing_periods where id=p_period_id;
  if v_period.id is null then raise exception 'Billing period not found'; end if;
  if not public.has_property_permission(v_period.property_id,'periods.manage') then raise exception 'Permission denied'; end if;
  if v_period.status='closed' then raise exception 'Billing period is closed'; end if;

  for rec in
    select c.id contract_id,c.contract_number,c.room_id,c.tenant_id,c.rent_amount,r.room_number
    from public.contracts c join public.rooms r on r.id=c.room_id
    where c.property_id=v_period.property_id and c.status='active'
  loop
    if exists(select 1 from public.invoices i where i.property_id=v_period.property_id and i.contract_id=rec.contract_id and i.billing_period=v_period.period_start) then
      continue;
    end if;

    select coalesce(sum(mr.amount),0) into v_water
    from public.meter_readings mr join public.meters m on m.id=mr.meter_id
    where mr.property_id=v_period.property_id and mr.room_id=rec.room_id
      and mr.billing_period=v_period.period_start and m.meter_type='water';

    select coalesce(sum(mr.amount),0) into v_electric
    from public.meter_readings mr join public.meters m on m.id=mr.meter_id
    where mr.property_id=v_period.property_id and mr.room_id=rec.room_id
      and mr.billing_period=v_period.period_start and m.meter_type='electricity';

    v_total := coalesce(rec.rent_amount,0)+coalesce(v_water,0)+coalesce(v_electric,0);
    insert into public.invoices(property_id,contract_id,invoice_number,billing_period,billing_period_id,issue_date,due_date,subtotal,total,status)
    values(v_period.property_id,rec.contract_id,
      'INV-'||to_char(v_period.period_start,'YYYYMM')||'-'||regexp_replace(rec.room_number,'[^A-Za-z0-9]','','g'),
      v_period.period_start,v_period.id,current_date,v_period.due_date,v_total,v_total,'issued')
    returning id into v_invoice_id;

    insert into public.invoice_items(invoice_id,item_type,description,quantity,unit_price,amount)
    values(v_invoice_id,'rent','ค่าเช่าห้อง',1,rec.rent_amount,rec.rent_amount);
    if v_water>0 then insert into public.invoice_items(invoice_id,item_type,description,quantity,unit_price,amount) values(v_invoice_id,'water','ค่าน้ำ',1,v_water,v_water); end if;
    if v_electric>0 then insert into public.invoice_items(invoice_id,item_type,description,quantity,unit_price,amount) values(v_invoice_id,'electricity','ค่าไฟ',1,v_electric,v_electric); end if;
    v_count:=v_count+1;
  end loop;

  update public.billing_periods set status='billed',billed_at=now(),updated_at=now() where id=p_period_id;
  insert into public.audit_logs(property_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_period.property_id,auth.uid(),'GENERATE_INVOICES','billing_period',p_period_id::text,jsonb_build_object('invoice_count',v_count));
  return v_count;
end $$;
grant execute on function public.generate_invoices_for_period(uuid) to authenticated;

create or replace function public.close_billing_period(p_period_id uuid)
returns void
language plpgsql
security definer set search_path=public
as $$
declare v public.billing_periods%rowtype; begin
  select * into v from public.billing_periods where id=p_period_id;
  if v.id is null then raise exception 'Billing period not found'; end if;
  if not public.has_property_permission(v.property_id,'periods.manage') then raise exception 'Permission denied'; end if;
  update public.billing_periods set status='closed',closed_at=now(),closed_by=auth.uid(),updated_at=now() where id=p_period_id;
  update public.invoices set closed_at=now() where billing_period_id=p_period_id and closed_at is null;
  insert into public.audit_logs(property_id,actor_id,action,entity_type,entity_id) values(v.property_id,auth.uid(),'CLOSE_PERIOD','billing_period',p_period_id::text);
end $$;
grant execute on function public.close_billing_period(uuid) to authenticated;

-- Recalculate invoice payment status after allocations.
create or replace function public.recalculate_invoice_status(p_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_total numeric; v_paid numeric; v_due date; begin
  select total,due_date into v_total,v_due from public.invoices where id=p_invoice_id;
  select coalesce(sum(pa.amount),0) into v_paid from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where pa.invoice_id=p_invoice_id and p.status='verified';
  update public.invoices set status=case when v_paid>=v_total then 'paid'::public.invoice_status when v_paid>0 then 'partially_paid'::public.invoice_status when v_due<current_date then 'overdue'::public.invoice_status else 'issued'::public.invoice_status end,updated_at=now() where id=p_invoice_id and status<>'cancelled';
end $$;

create or replace function public.verify_payment_and_issue_receipt(p_payment_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v public.payments%rowtype; v_receipt text; x record; begin
  select * into v from public.payments where id=p_payment_id;
  if v.id is null then raise exception 'Payment not found'; end if;
  if not public.has_property_permission(v.property_id,'payments.manage') and not public.has_property_permission(v.property_id,'billing.verify') then raise exception 'Permission denied'; end if;
  update public.payments set status='verified',verified_by=auth.uid(),verified_at=now() where id=p_payment_id;
  v_receipt := 'RC-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(p_payment_id::text,'-',''),1,6));
  insert into public.receipts(property_id,payment_id,receipt_number,issued_by) values(v.property_id,p_payment_id,v_receipt,auth.uid()) on conflict(payment_id) do update set receipt_number=public.receipts.receipt_number returning receipt_number into v_receipt;
  for x in select invoice_id from public.payment_allocations where payment_id=p_payment_id loop perform public.recalculate_invoice_status(x.invoice_id); end loop;
  insert into public.audit_logs(property_id,actor_id,action,entity_type,entity_id,new_data) values(v.property_id,auth.uid(),'VERIFY_PAYMENT','payment',p_payment_id::text,jsonb_build_object('receipt_number',v_receipt));
  return v_receipt;
end $$;
grant execute on function public.verify_payment_and_issue_receipt(uuid) to authenticated;

create or replace function public.complete_checkout(p_checkout_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v public.checkout_cases%rowtype; begin
  select * into v from public.checkout_cases where id=p_checkout_id;
  if v.id is null then raise exception 'Checkout not found'; end if;
  if not public.has_property_permission(v.property_id,'checkout.manage') then raise exception 'Permission denied'; end if;
  update public.checkout_cases set status='completed',checkout_date=coalesce(checkout_date,current_date),completed_at=now(),completed_by=auth.uid(),updated_at=now() where id=p_checkout_id;
  update public.contracts set status='terminated',end_date=coalesce(end_date,current_date),updated_at=now() where id=v.contract_id;
  update public.rooms set status='vacant',updated_at=now() where id=v.room_id;
  update public.tenants set archived_at=coalesce(archived_at,now()),updated_at=now() where id=v.tenant_id;
  insert into public.audit_logs(property_id,actor_id,action,entity_type,entity_id) values(v.property_id,auth.uid(),'COMPLETE_CHECKOUT','checkout',p_checkout_id::text);
end $$;
grant execute on function public.complete_checkout(uuid) to authenticated;


-- Private document bucket (files are stored under <property_id>/...).
insert into storage.buckets(id,name,public,file_size_limit)
values('dormplus-documents','dormplus-documents',false,10485760)
on conflict(id) do nothing;

drop policy if exists "dormplus_documents_read" on storage.objects;
create policy "dormplus_documents_read" on storage.objects for select to authenticated
using (
  bucket_id='dormplus-documents'
  and public.has_property_permission((storage.foldername(name))[1]::uuid,'documents.view')
);

drop policy if exists "dormplus_documents_insert" on storage.objects;
create policy "dormplus_documents_insert" on storage.objects for insert to authenticated
with check (
  bucket_id='dormplus-documents'
  and public.has_property_permission((storage.foldername(name))[1]::uuid,'documents.manage')
);

drop policy if exists "dormplus_documents_delete" on storage.objects;
create policy "dormplus_documents_delete" on storage.objects for delete to authenticated
using (
  bucket_id='dormplus-documents'
  and public.has_property_permission((storage.foldername(name))[1]::uuid,'documents.manage')
);

-- Tenant self-service policies. These are intentionally narrow and coexist with staff RBAC policies.
drop policy if exists "tenants_self_select" on public.tenants;
create policy "tenants_self_select" on public.tenants for select using(user_id=auth.uid());
drop policy if exists "contracts_tenant_self_select" on public.contracts;
create policy "contracts_tenant_self_select" on public.contracts for select using(exists(select 1 from public.tenants t where t.id=tenant_id and t.user_id=auth.uid()));
drop policy if exists "invoices_tenant_self_select" on public.invoices;
create policy "invoices_tenant_self_select" on public.invoices for select using(exists(select 1 from public.contracts c join public.tenants t on t.id=c.tenant_id where c.id=contract_id and t.user_id=auth.uid()));
drop policy if exists "payments_tenant_self_select" on public.payments;
create policy "payments_tenant_self_select" on public.payments for select using(exists(select 1 from public.tenants t where t.id=tenant_id and t.user_id=auth.uid()));
drop policy if exists "maintenance_tenant_self_select" on public.maintenance_tickets;
create policy "maintenance_tenant_self_select" on public.maintenance_tickets for select using(exists(select 1 from public.tenants t where t.id=tenant_id and t.user_id=auth.uid()));
drop policy if exists "maintenance_tenant_self_insert" on public.maintenance_tickets;
create policy "maintenance_tenant_self_insert" on public.maintenance_tickets for insert with check(exists(select 1 from public.tenants t where t.id=tenant_id and t.user_id=auth.uid()));


-- Lock closed invoices for non-owners.
create or replace function public.guard_closed_invoice_update()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.closed_at is not null and not public.is_property_owner(old.property_id) then
    raise exception 'รอบบิลถูกปิดแล้ว เฉพาะ Owner เท่านั้นที่แก้รายการย้อนหลังได้';
  end if;
  return new;
end $$;
drop trigger if exists guard_closed_invoice_update on public.invoices;
create trigger guard_closed_invoice_update before update or delete on public.invoices
for each row execute function public.guard_closed_invoice_update();

-- Generic audit trail for critical operational tables.
create or replace function public.audit_critical_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_property uuid;
  v_id text;
begin
  v_property := coalesce((to_jsonb(new)->>'property_id')::uuid,(to_jsonb(old)->>'property_id')::uuid);
  v_id := coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id');
  if v_property is not null then
    insert into public.audit_logs(property_id,actor_id,action,entity_type,entity_id,old_data,new_data)
    values(v_property,auth.uid(),tg_op,tg_table_name,v_id,case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
  end if;
  return coalesce(new,old);
end $$;

do $$
declare t text; begin
  foreach t in array array['rooms','tenants','contracts','invoices','payments','meter_readings','expenses','deposit_ledger','checkout_cases'] loop
    execute format('drop trigger if exists audit_critical_change on public.%I',t);
    execute format('create trigger audit_critical_change after insert or update or delete on public.%I for each row execute function public.audit_critical_change()',t);
  end loop;
end $$;

commit;
