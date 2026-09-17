-- DormPlus 009: Discord manual meter reading + manager approval
-- Flow: /water or /electric -> user types reading + attaches photo -> pending approval -> manager approves -> meter_readings is written.
-- Run after 008_discord_meter_capture.sql.

begin;

alter table public.discord_meter_submissions
  add column if not exists submitted_reading numeric(14,2),
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists approved_meter_reading_id uuid references public.meter_readings(id) on delete set null;

-- Preserve meaning of submissions created by the old OCR/auto-save workflow.
update public.discord_meter_submissions
set submitted_reading = coalesce(submitted_reading, ocr_reading)
where submitted_reading is null
  and ocr_reading is not null;

update public.discord_meter_submissions
set approval_status = 'approved',
    reviewed_at = coalesce(reviewed_at, processed_at, created_at),
    review_note = coalesce(review_note, 'รายการเดิมบันทึกโดย workflow อัตโนมัติก่อน migration 009')
where status = 'saved'
  and approval_status = 'pending';

update public.discord_meter_submissions
set approval_status = 'rejected',
    reviewed_at = coalesce(reviewed_at, processed_at, created_at),
    review_note = coalesce(review_note, error_message, 'รายการเดิมประมวลผลไม่สำเร็จ')
where status = 'failed'
  and approval_status = 'pending';

create index if not exists idx_discord_meter_pending_approval
  on public.discord_meter_submissions(property_id, approval_status, created_at desc);

create index if not exists idx_discord_meter_building_pending
  on public.discord_meter_submissions(property_id, building_id, approval_status, created_at desc);

commit;
