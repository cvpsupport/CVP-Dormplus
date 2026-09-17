-- DormPlus 005: Import legacy dormitory data from "ค่าหอพัก 6 มิ.ย 69.xlsx"
-- Source billing period: June 2026 (พ.ศ. 2569)
-- Expected import: 110 rooms, 86 current tenants/contracts, 220 meter readings,
-- 110 legacy billing snapshots, 32 historical exit records.
--
-- IMPORTANT:
-- 1) Run 004_legacy_import_support.sql first.
-- 2) If your Supabase project has exactly ONE Authentication user, no edit is required.
-- 3) If it has multiple users, set owner_email in _legacy_config below.

begin;

create temp table _legacy_config (
  owner_email text,
  project_name text not null,
  project_code text not null
) on commit drop;

insert into _legacy_config(owner_email, project_name, project_code)
values (
  null, -- OPTIONAL: replace null with 'your-login@email.com' when Auth has multiple users
  'CHAVANAPHAT CO.,LTD',
  'CVP-LEGACY-202606'
);

create temp table _legacy_ctx (
  owner_id uuid not null,
  property_id uuid not null
) on commit drop;

do $$
declare
  v_owner_email text;
  v_project_name text;
  v_project_code text;
  v_owner_id uuid;
  v_user_count int;
  v_property_id uuid;
begin
  select owner_email, project_name, project_code
    into v_owner_email, v_project_name, v_project_code
  from _legacy_config
  limit 1;

  if v_owner_email is not null and btrim(v_owner_email) <> '' then
    select id into v_owner_id
    from auth.users
    where lower(email) = lower(btrim(v_owner_email))
    limit 1;

    if v_owner_id is null then
      raise exception 'ไม่พบ Supabase Auth user ที่มี email=%', v_owner_email;
    end if;
  else
    select count(*) into v_user_count from auth.users;
    if v_user_count <> 1 then
      raise exception 'พบ Supabase Auth users จำนวน % บัญชี กรุณาแก้ owner_email ใน _legacy_config แล้วรันใหม่', v_user_count;
    end if;
    select id into v_owner_id from auth.users limit 1;
  end if;

  insert into public.profiles(id, full_name)
  select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name',''), u.email, '')
  from auth.users u
  where u.id = v_owner_id
  on conflict (id) do nothing;

  select p.id into v_property_id
  from public.properties p
  where p.created_by = v_owner_id
    and p.code = v_project_code
  limit 1;

  if v_property_id is null then
    insert into public.properties(
      name, code, project_type, status, description,
      timezone, billing_day, due_day,
      electricity_rate, water_rate, water_minimum_charge, water_service_fee,
      created_by,
      metadata
    )
    values(
      v_project_name, v_project_code, 'dormitory', 'active',
      'นำเข้าจากระบบ Excel เดิม: ค่าหอพัก มิถุนายน 2569',
      'Asia/Bangkok', 25, 5,
      8, 28, 150, 10,
      v_owner_id,
      jsonb_build_object(
        'legacy_import','2026-06',
        'source_file','ค่าหอพัก 6 มิ.ย 69.xlsx',
        'import_strategy','staged-legacy'
      )
    )
    returning id into v_property_id;
  else
    update public.properties
    set name = v_project_name,
        project_type = 'dormitory',
        status = 'active',
        electricity_rate = 8,
        water_rate = 28,
        water_minimum_charge = 150,
        water_service_fee = 10,
        description = 'นำเข้าจากระบบ Excel เดิม: ค่าหอพัก มิถุนายน 2569',
        metadata = coalesce(metadata,'{}'::jsonb) ||
          jsonb_build_object('legacy_import','2026-06','source_file','ค่าหอพัก 6 มิ.ย 69.xlsx'),
        updated_at = now()
    where id = v_property_id;
  end if;

  insert into public.property_members(property_id, user_id, role)
  values(v_property_id, v_owner_id, 'owner')
  on conflict(property_id, user_id)
  do update set role = 'owner';

  insert into _legacy_ctx(owner_id, property_id)
  values(v_owner_id, v_property_id);
end
$$;

-- ---------------------------------------------------------------------------
-- Buildings
-- ---------------------------------------------------------------------------
insert into public.buildings(property_id, name, code, floor_count, status, description)
select c.property_id, x.name, x.code, x.floor_count, 'active', x.description
from _legacy_ctx c
cross join (
  values
    ('หอเก่า','OLD',3,'อาคารเดิม ห้องเลข 101-315'),
    ('หอใน','INNER',1,'หอพักภายใน รหัสห้องรูปแบบ A/B/C/D'),
    ('หน้าโรงงาน','FRONT',1,'หอพักหน้าโรงงาน รหัสห้องตัวเลข/ตัวอักษร')
) as x(name,code,floor_count,description)
on conflict(property_id, name)
do update set
  code = excluded.code,
  floor_count = excluded.floor_count,
  status = excluded.status,
  description = excluded.description,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Current snapshot from legacy workbook
-- ---------------------------------------------------------------------------
create temp table _legacy_current (
  building text not null,
  source_row int not null,
  room_number text not null,
  floor_number int,
  occupied boolean not null,
  tenant_name text,
  raw_group text,
  department text,
  nationality text,
  employee_code text,
  rent_amount numeric(12,2) not null default 0,
  water_previous numeric(14,2),
  water_current numeric(14,2),
  water_usage numeric(14,2),
  water_amount numeric(12,2),
  electricity_previous numeric(14,2),
  electricity_current numeric(14,2),
  electricity_usage numeric(14,2),
  electricity_amount numeric(12,2),
  electricity_rate numeric(12,4),
  other_charge numeric(12,2) not null default 0,
  total_due numeric(12,2) not null default 0,
  note text,
  review_flag text
) on commit drop;

insert into _legacy_current(
  building, source_row, room_number, floor_number, occupied,
  tenant_name, raw_group, department, nationality, employee_code,
  rent_amount,
  water_previous, water_current, water_usage, water_amount,
  electricity_previous, electricity_current, electricity_usage, electricity_amount, electricity_rate,
  other_charge, total_due, note, review_flag
)
values
('หอเก่า', 4, '101', 1, false, null, null, null, null, null, 0, 94, 94, 0, 0, 6027, 6027, 0, 0, null, 0, 0, null, null),
('หอเก่า', 5, '102', 1, true, 'คุณณัฐวุติ บุตรแดง', 'เยลลี่', 'เยลลี่', null, null, 800, 1233, 1239, 6, 178, 48, 130, 82, 656, 8, 0, 1634, null, null),
('หอเก่า', 6, '103', 1, false, null, null, null, null, null, 0, 1074, 1074, 0, 0, 1156, 1156, 0, 0, null, 0, 0, null, null),
('หอเก่า', 7, '104', 1, true, 'Zi Myo oo', 'เยลลี่', 'เยลลี่', null, null, 800, 1319, 1321, 2, 150, 2280, 2317, 37, 333, 9, 0, 1283, null, 'ไฟฟ้าใช้อัตรา 9 บาท/หน่วย'),
('หอเก่า', 8, '105', 1, true, 'คุณธวัช   มาสะและ', 'ขาย', 'ขาย', null, null, 800, 1257, 1258, 1, 150, 95, 97, 2, 16, 8, 0, 966, null, null),
('หอเก่า', 9, '106', 1, false, null, null, null, null, null, 0, 1182, 1182, 0, 0, 4751, 4751, 0, 0, null, 0, 0, null, null),
('หอเก่า', 10, '107', 1, true, 'คุณสุเพียร   รักชาติ', 'หีบห่อ 1', 'หีบห่อ 1', null, null, 800, 179, 186, 7, 206, 4281, 4348, 67, 536, 8, 0, 1542, null, 'water_amount เดิมเป็น #NAME?; คำนวณ staging ตามสูตร legacy'),
('หอเก่า', 11, '108', 1, true, 'MR.ZIN MIN HTIKE  198', null, null, null, '198', 800, 912, 916, 4, 150, 4857, 4888, 31, 248, 8, 0, 1198, null, null),
('หอเก่า', 12, '109', 1, true, 'MR.KYAW LIN AUNG 194', null, null, null, '194', 800, 839, 846, 7, 206, 1087, 1178, 91, 728, 8, 0, 1734, null, null),
('หอเก่า', 13, '201', 2, true, 'คุณรัชฎา วรรณสุข', 'ต่างประเทศ', 'ต่างประเทศ', null, null, 800, 1355, 1359, 4, 150, 7186, 7217, 31, 248, 8, 0, 1198, null, null),
('หอเก่า', 14, '202', 2, true, 'คุณบุญเหลือ  แสวงหา', 'หีบห่อ 2', 'หีบห่อ 2', null, null, 800, 961, 962, 1, 150, 8667, 8717, 50, 400, 8, 0, 1350, null, null),
('หอเก่า', 15, '203', 2, false, null, null, null, null, null, 0, 1720, 1720, 0, 0, 6200, 6200, 0, 0, null, 0, 0, null, null),
('หอเก่า', 16, '204', 2, true, 'คุณทองใบ  พวงศรี', 'รีดซอง', 'รีดซอง', null, null, 800, 1341, 1344, 3, 150, 1604, 1668, 64, 512, 8, 0, 1462, null, null),
('หอเก่า', 17, '205', 2, false, null, null, null, null, null, 0, 1959, 1959, 0, 0, 8570, 8570, 0, 0, null, 0, 0, null, null),
('หอเก่า', 18, '206', 2, true, 'คุณอาภรณ์  น้อยวังหิน', 'กระบอก', 'กระบอก', null, null, 800, 809, 814, 5, 150, 8709, 8778, 69, 552, 8, 0, 1502, null, null),
('หอเก่า', 19, '207', 2, true, 'คุณหฤทัย จงประสพโชคชัย', 'เยลลี่', 'เยลลี่', null, null, 800, 1223, 1226, 3, 150, 942, 986, 44, 352, 8, 0, 1302, 'มิเตอร์ 15 แอมป์ปัดเศษ', null),
('หอเก่า', 20, '208', 2, false, null, null, null, null, null, 0, 1420, 1420, 0, 0, 2473, 2473, 0, 0, null, 0, 0, null, null),
('หอเก่า', 21, '209', 2, true, 'คุณจิดาภา  เนตรรักษ์', 'กระบอก', 'กระบอก', null, null, 800, 2166, 2176, 10, 290, 578, 642, 64, 512, 8, 0, 1602, 'มิเตอร์ 15 แอมป์ปัดเศษ', null),
('หอเก่า', 22, '210', 2, true, 'คุณวิลาวรรณ์  อินทโคตร', 'กระบอก', 'กระบอก', null, null, 800, 912, 918, 6, 178, 7114, 7162, 48, 384, 8, 0, 1362, null, null),
('หอเก่า', 23, '211', 2, true, 'คุณลลิตา ภารพัฒน์', 'กระบอก', 'กระบอก', null, null, 400, 2781, 2794, 13, 374, 1561, 1570, 9, 72, 8, 0, 846, 'มิเตอร์ 15 แอมป์', null),
('หอเก่า', 24, '212', 2, true, 'Aung Myo Than (อังมิวตัน)120', 'เยลลี่', 'เยลลี่', null, '120', 800, 2203, 2213, 10, 290, 5378, 5462, 84, 672, 8, 0, 1762, null, null),
('หอเก่า', 25, '213', 2, true, 'คุณกาญจนา  สมแก้ว', 'ช็อคฯ', 'ช็อคฯ', null, null, 800, 436, 443, 7, 206, 6616, 6701, 85, 680, 8, 0, 1686, 'มิเตอร์ 15 แอมป์', null),
('หอเก่า', 26, '214', 2, true, 'คุณสายัณห์  มีระกุล', 'ตัด,ดูด', 'ตัด,ดูด', null, null, 800, 1210, 1215, 5, 150, 3690, 3805, 115, 920, 8, 0, 1870, null, null),
('หอเก่า', 27, '215', 2, true, 'คุณธนิษส์  ศรีเจริญ', 'ขนส่ง', 'ขนส่ง', null, null, 0, 1390, 1390, 0, 0, 216, 216, 0, 0, null, 0, 0, null, 'มีผู้พักแต่ค่าเช่าเป็น 0; มีผู้พักแต่ยอดรวมเป็น 0'),
('หอเก่า', 28, '216', 2, true, 'MR.MIN THU  180', null, null, null, '180', 800, 665, 670, 5, 150, 8277, 8363, 86, 688, 8, 0, 1638, null, null),
('หอเก่า', 29, '217', 2, false, null, null, null, null, null, 0, 1507, 1507, 0, 0, 3747, 3747, 0, 0, null, 0, 0, null, null),
('หอเก่า', 30, '218', 2, true, 'นางสาวอุบล  ศิริศรี', 'รีดซอง', 'รีดซอง', null, null, 800, 1238, 1240, 2, 150, 164, 227, 63, 504, 8, 0, 1454, null, null),
('หอเก่า', 31, '301', 3, true, 'คุณนันทนา  ไชยสีหา', 'กระบอก', 'กระบอก', null, null, 800, 569, 590, 21, 598, 809, 953, 144, 1152, 8, 0, 2550, null, null),
('หอเก่า', 32, '302', 3, true, 'คุณนารี  ศรีตะ', 'กระบอก', 'กระบอก', null, null, 800, 1945, 1950, 5, 150, 10791, 10929, 138, 1242, 9, 0, 2192, 'มิเตอร์ 15 แอมป์', 'ไฟฟ้าใช้อัตรา 9 บาท/หน่วย'),
('หอเก่า', 33, '303', 3, true, 'คุณมานะ พินทอง', 'ขนส่ง', 'ขนส่ง', null, null, 800, 1460, 1473, 13, 374, 8234, 8453, 219, 1971, 9, 0, 3145, null, 'ไฟฟ้าใช้อัตรา 9 บาท/หน่วย'),
('หอเก่า', 34, '304', 3, true, 'เก็บของ', null, null, null, null, 0, 927, 927, 0, 0, 6610, 6610, 0, 0, null, 0, 0, null, 'มีผู้พักแต่ค่าเช่าเป็น 0; มีผู้พักแต่ยอดรวมเป็น 0'),
('หอเก่า', 35, '305', 3, true, 'คุณประทุมมี  รอดวินิจ', 'รีดซอง', 'รีดซอง', null, null, 800, 620, 621, 1, 150, 5519, 5585, 66, 528, 8, 0, 1478, null, null),
('หอเก่า', 36, '306', 3, false, null, null, null, null, null, 0, 909, 909, 0, 0, 9021, 9021, 0, 0, null, 0, 0, null, null),
('หอเก่า', 37, '307', 3, false, null, null, null, null, null, 0, 1085, 1085, 0, 0, 4802, 4802, 0, 0, null, 0, 0, null, null),
('หอเก่า', 38, '308', 3, true, 'คุณสุธรรม  ตุ้นด้วง', 'ขาย', 'ขาย', null, null, 800, 1125, 1125, 0, 0, 18610, 18675, 65, 585, 9, 0, 1385, null, 'ไฟฟ้าใช้อัตรา 9 บาท/หน่วย'),
('หอเก่า', 39, '309', 3, false, null, null, null, null, null, 0, 1028, 1028, 0, 0, 7249, 7249, 0, 0, null, 0, 0, null, null),
('หอเก่า', 40, '310', 3, false, null, null, null, null, null, 0, 814, 814, 0, 0, 2629, 2629, 0, 0, null, 0, 0, null, null),
('หอเก่า', 41, '311', 3, true, 'คุณธานินทร์   สมทัศน์', 'อัดเม็ด', 'อัดเม็ด', null, null, 800, 1657, 1666, 9, 262, 7924, 7981, 57, 456, 8, 0, 1518, null, null),
('หอเก่า', 42, '312', 3, true, 'คุณดวงเนตร   โพลังหนู', 'สกรีน', 'สกรีน', null, null, 800, 1668, 1679, 11, 318, 5906, 6019, 113, 904, 8, 0, 2022, 'มิเตอร์ 15 แอมป์ปัดเศษ', null),
('หอเก่า', 43, '313', 3, true, 'คุณเดือนฉาย  ศรีไกร', 'กระบอก', 'กระบอก', null, null, 800, 2667, 2677, 10, 290, 3034, 3082, 48, 384, 8, 0, 1474, null, null),
('หอเก่า', 44, '314', 3, true, 'คุณสาคร   ทุมมานอก', 'ขนส่ง', 'ขนส่ง', null, null, 800, 3340, 3348, 8, 234, 3816, 3880, 64, 512, 8, 0, 1546, null, null),
('หอเก่า', 45, '315', 3, true, 'คุณมธุรส  อุตส่าห์', 'QC', 'QC', null, null, 800, 1557, 1562, 5, 150, 849, 864, 15, 12, 0.8, 0, 962, null, 'อัตราไฟฟ้าผิดปกติ 0.8 บาท/หน่วย'),
('หอเก่า', 46, '316', 3, false, null, null, null, null, null, 0, 3224, 3224, 0, 0, 7889, 7889, 0, 0, null, 0, 0, null, null),
('หอเก่า', 47, '317', 3, false, null, null, null, null, null, 0, 2030, 2030, 0, 0, 2337, 2337, 0, 0, null, 0, 0, null, null),
('หอเก่า', 48, '318', 3, false, null, null, null, null, null, 0, 1340, 1340, 0, 0, 4794, 4794, 0, 0, null, 0, 0, null, null),
('หอใน', 4, 'A1', null, true, 'Nay La Min     เน ลา มิน 6', 'Myanmar', null, 'Myanmar', '6', 800, 1009, 1012, 3, 150, 6143, 6219, 76, 608, 8, 0, 1558, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 5, 'A2', null, true, 'คุณชำนาญ  อวดอ้าง', 'ขาย', 'ขาย', null, null, 800, 482, 482, 0, 0, 4245, 4249, 4, 32, 8, 0, 832, null, null),
('หอใน', 6, 'A3', null, true, 'คุณกรุณา กรัดภิรมย์', 'ฉีดพีวีซี', 'ฉีดพีวีซี', null, null, 600, 533, 535, 2, 150, 3423, 3430, 7, 56, 8, 0, 806, null, null),
('หอใน', 7, 'A4', null, true, 'เนย์ออง 127', 'ฉีดพีวีซี', 'ฉีดพีวีซี', null, '127', 600, 1557, 1568, 11, 318, 7319, 7421, 102, 816, 8, 0, 1734, null, null),
('หอใน', 8, 'A5', null, true, 'คุณธีระพล   เหม็งพานิช', 'ขาย', 'ขาย', null, null, 600, 1341, 1347, 6, 178, 9713, 9767, 54, 432, 8, 0, 1210, null, null),
('หอใน', 9, 'A6', null, true, 'คุณสุวิทย์  ภูวงษี', 'ขาย', 'ขาย', null, null, 600, 1267, 1269, 2, 150, 6252, 6258, 6, 48, 8, 0, 798, null, null),
('หอใน', 10, 'B1', null, true, 'Saw Are  Ni  (อา นี) 71', 'Myanmar', null, 'Myanmar', '71', 700, 1319, 1325, 6, 178, 2282, 2381, 99, 792, 8, 0, 1670, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 11, 'B2', null, true, 'Khin Khin Htwe (136)', 'Myanmar', null, 'Myanmar', '136', 700, 1116, 1125, 9, 262, 7721, 7800, 79, 632, 8, 0, 1594, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 12, 'B3', null, true, 'Kyaw  Zin win ( จอซินวิน) 123', 'Myanmar', null, 'Myanmar', '123', 700, 1017, 1026, 9, 262, 9044, 9111, 67, 536, 8, 0, 1498, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 13, 'B4', null, true, 'คุณชัยบาดาล  ยุ่งยุคา', 'เยลลี่', 'เยลลี่', null, null, 600, 1254, 1258, 4, 150, 6706, 6734, 28, 224, 8, 0, 974, null, null),
('หอใน', 14, 'B5', null, true, 'Michael Ri  145', 'Myanmar', null, 'Myanmar', '145', 700, 19, 20, 1, 150, 7133, 7165, 32, 256, 8, 0, 1106, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 15, 'B6', null, true, 'คุณคัตภัทร  ศิลบำรุง', 'บัญชี', 'บัญชี', null, null, 700, 1791, 1797, 6, 178, 2301, 2317, 16, 128, 8, 0, 1006, null, null),
('หอใน', 16, 'B7', null, true, 'คุณนภาพร  ทองโสภา', 'บัญชี', 'บัญชี', null, null, 600, 4584, 4599, 15, 430, 17854, 18131, 277, 2493, 9, 0, 3523, 'แอร์9', 'ไฟฟ้าใช้อัตรา 9 บาท/หน่วย'),
('หอใน', 17, 'B8', null, false, null, null, null, null, null, 0, 1077, 1077, 0, 0, 5623, 5623, 0, 0, null, 0, 0, null, null),
('หอใน', 18, 'B9', null, true, 'Zwe Thiha ซเว ตีห้า', 'Myanmar', null, 'Myanmar', null, 700, 1397, 1401, 4, 150, 8585, 8612, 27, 216, 8, 0, 1066, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 19, 'B10', null, true, 'Than dar Hlaning  (ทัน ตา ลาง)29', 'Myanmar', null, 'Myanmar', '29', 700, 263, 269, 6, 178, 1706, 1763, 57, 456, 8, 0, 1334, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 20, 'B11', null, false, null, null, null, null, null, 0, 1788, 1788, 0, 0, 3672, 3672, 0, 0, null, 0, 0, null, null),
('หอใน', 21, 'C1', null, true, 'Chaw Pone  (ซอ ปง)77', 'Myanmar', null, 'Myanmar', '77', 600, 1357, 1368, 11, 318, 9391, 9467, 76, 608, 8, 0, 1526, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 22, 'C2', null, true, 'Aung Moe win (เอามูวิน)', 'Myanmar', null, 'Myanmar', null, 600, 1258, 1275, 17, 486, 7673, 7764, 91, 728, 8, 0, 1814, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 23, 'C3', null, true, 'คุณบัวไข เหล่าพร', 'เยลลี่', 'เยลลี่', null, null, 500, 1697, 1701, 4, 150, 1692, 1737, 45, 360, 8, 0, 1010, null, null),
('หอใน', 24, 'C4', null, true, 'คุณจิราพรรณ สายทอง', 'รีดซอง', 'รีดซอง', null, null, 500, 845, 849, 4, 150, 6550, 6584, 34, 272, 8, 0, 922, null, null),
('หอใน', 25, 'C5', null, true, 'คุณสุวภัทร  ขุนสิง', 'หีบห่อ 2', 'หีบห่อ 2', null, null, 500, 2268, 2289, 21, 598, 3650, 3746, 96, 768, 8, 0, 1866, null, null),
('หอใน', 26, 'C6', null, true, 'Chan Moe  (ชามู)*104', 'Myanmar', null, 'Myanmar', '104', 600, 1581, 1590, 9, 262, 9439, 9502, 63, 504, 8, 0, 1366, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 27, 'C7', null, true, 'Tun Tun Naing (โทโทไน)81', 'Myanmar', null, 'Myanmar', '81', 600, 258, 261, 3, 150, 1735, 1791, 56, 448, 8, 0, 1198, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 28, 'C8', null, true, 'คุณทองหล่อ   โพธิ์งาม', 'หีบห่อ 1', 'หีบห่อ 1', null, null, 500, 1382, 1387, 5, 150, 145, 150, 5, 40, 8, 0, 690, null, null),
('หอใน', 29, 'C9', null, true, 'จอ ตู ซู', 'ฉีดพีวีซี', 'ฉีดพีวีซี', null, null, 600, 1286, 1291, 5, 150, 3412, 3470, 58, 464, 8, 0, 1214, null, null),
('หอใน', 30, 'C10', null, true, 'ลาอู 150', 'Myanmar', null, 'Myanmar', '150', 600, 1195, 1212, 17, 486, 9950, 9971, 21, 168, 8, 0, 1254, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 31, 'C11', null, true, 'คุณอรชร  ประมังคะตา', 'ตัด,ดูด', 'ตัด,ดูด', null, null, 500, 883, 887, 4, 150, 5345, 5385, 40, 360, 9, 0, 1010, null, 'ไฟฟ้าใช้อัตรา 9 บาท/หน่วย'),
('หอใน', 32, 'D1', null, true, 'Aye Aye Than   (มะ  เอ)25', 'Myanmar', null, 'Myanmar', '25', 500, 904, 909, 5, 150, 9447, 9520, 73, 584, 8, 0, 1234, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 33, 'D2', null, true, 'Kyaw Min Tun จอ มิน ทง', 'Myanmar', null, 'Myanmar', null, 500, 544, 551, 7, 206, 5600, 5632, 32, 256, 8, 0, 962, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 34, 'D3', null, true, 'MR.SHIN THANT KO KO 227', null, null, null, '227', 500, 663, 669, 6, 178, 5055, 5116, 61, 488, 8, 0, 1166, null, null),
('หอใน', 35, 'D4', null, true, 'Khin Maung Htwe คินมองเท', 'Myanmar', null, 'Myanmar', null, 500, 594, 597, 3, 150, 7885, 7949, 64, 512, 8, 0, 1162, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 36, 'D5', null, true, 'MAUNG PU มองบุ', 'Myanmar', null, 'Myanmar', null, 500, 25, 26, 1, 150, 8089, 8165, 76, 608, 8, 0, 1258, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 37, 'D6', null, false, null, null, null, null, null, 0, 415, 415, 0, 0, 5449, 5449, 0, 0, null, 0, 0, null, null),
('หอใน', 38, 'D7', null, true, 'MR.MAUNG AYE WIN เอ มอง วิน 225', 'Myanmar', null, 'Myanmar', '225', 500, 608, 610, 2, 150, 5775, 5797, 22, 176, 8, 0, 826, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 39, 'D8', null, true, 'เค มอ ชิน', 'Myanmar', null, 'Myanmar', null, 500, 58, 59, 1, 150, 6222, 6252, 30, 240, 8, 0, 890, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 40, 'D9', null, true, 'Ma Pa pa Lin 152', 'Myanmar', null, 'Myanmar', '152', 500, 829, 834, 5, 150, 6657, 6707, 50, 400, 8, 0, 1050, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 41, 'D10', null, true, 'Zaw Zaw (ซอ ซอ)36', 'Myanmar', null, 'Myanmar', '36', 500, 895, 903, 8, 234, 9283, 9344, 61, 488, 8, 0, 1222, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หอใน', 42, 'D11', null, true, 'Aung Moe  (เอามู)', 'Myanmar', null, 'Myanmar', null, 500, 790, 797, 7, 206, 6399, 6516, 117, 936, 8, 0, 1642, null, 'Myanmar ถูกย้ายจากคอลัมน์แผนกไป nationality'),
('หน้าโรงงาน', 4, '1', null, true, 'คุณดาวรุ่ง   แร่เพชร', 'คนนอก', 'คนนอก', null, null, 0, 0, 0, 0, 0, 1916, 1994, 78, 624, 8, 0, 624, 'สด', 'มีผู้พักแต่ค่าเช่าเป็น 0'),
('หน้าโรงงาน', 5, '2', null, true, 'คุณเฉลียว   ทองขาว', 'บุคคล', 'บุคคล', null, null, 0, 0, 0, 0, 0, 20328, 20570, 242, 1936, 8, 0, 1936, 'สด', 'มีผู้พักแต่ค่าเช่าเป็น 0'),
('หน้าโรงงาน', 6, '3', null, true, 'คุณธนโชติ   ต่างท้วม', 'เตรียมผง', 'เตรียมผง', null, null, 1500, 0, 0, 0, 0, 8003, 8198, 195, 1560, 8, 0, 3060, 'หัก1400คืนกุหลาบ', null),
('หน้าโรงงาน', 7, '4', null, true, 'คุณเรวัต  อินทร์โยธา', 'Q.C.', 'Q.C.', null, null, 800, 114, 130, 16, 458, 5944, 5981, 37, 296, 8, 0, 1554, null, null),
('หน้าโรงงาน', 8, '5', null, true, 'คุณพิมพ์ใจ  จันทรุทัย', 'สต็อกฯ', 'สต็อกฯ', null, null, 800, 100, 104, 4, 150, 6967, 7029, 62, 496, 8, 0, 1446, null, null),
('หน้าโรงงาน', 9, '6', null, true, 'คุณชัชวาลย์ เบ้าพันธ์', 'ช่าง', 'ช่าง', null, null, 400, 759, 763, 4, 150, 5228, 5250, 22, 176, 8, 0, 726, null, null),
('หน้าโรงงาน', 10, '7', null, true, 'คุณมาริน   โพล้งหนู', 'สกรีน', 'สกรีน', null, null, 800, 2113, 2129, 16, 458, 1668, 1704, 36, 288, 8, 0, 1546, null, null),
('หน้าโรงงาน', 11, '8', null, true, 'คุณกรุงศรี มงคลเลิศ', 'เตรียมผง', 'เตรียมผง', null, null, 800, 198, 201, 3, 150, 1167, 1180, 13, 104, 8, 0, 1054, null, null),
('หน้าโรงงาน', 12, '9', null, true, 'คุณสุวิทย์  เรือนเงิน', 'พป.', 'พป.', null, null, 800, 70, 78, 8, 234, 504, 531, 27, 243, 9, 0, 1277, null, 'ไฟฟ้าใช้อัตรา 9 บาท/หน่วย'),
('หน้าโรงงาน', 13, '10', null, true, 'คุณตรีสุคนธ์   ดำขำ', 'คิวซี', 'คิวซี', null, null, 800, 71, 77, 6, 178, 403, 444, 41, 328, 8, 0, 1306, null, null),
('หน้าโรงงาน', 14, '11', null, false, null, null, null, null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, 0, 0, null, null),
('หน้าโรงงาน', 15, '1A', null, true, 'Zaw Myint Wai   ซอนิฮุย 5', null, null, null, '5', 800, 636, 638, 2, 150, 7666, 7719, 53, 424, 8, 0, 1374, null, null),
('หน้าโรงงาน', 17, '2A', null, true, 'kyil Win               จี ลุย 32', null, null, null, '32', 800, 936, 945, 9, 262, 2471, 2584, 113, 904, 8, 0, 1966, null, null),
('หน้าโรงงาน', 18, '2B', null, true, 'Hla Nyunt          ลา งิว 105', null, null, null, '105', 0, 0, 0, 0, null, 0, 0, 0, null, null, 0, 0, null, 'มีผู้พักแต่ค่าเช่าเป็น 0; มีผู้พักแต่ยอดรวมเป็น 0'),
('หน้าโรงงาน', 20, '3A', null, true, 'Lar Bwe Htoo ลาบวยทู', 'เตรียมผง', 'เตรียมผง', null, null, 800, 1001, 1011, 10, 290, 2827, 2949, 122, 976, 8, 0, 2066, '243089', null),
('หน้าโรงงาน', 21, '3B', null, false, null, null, null, null, null, 0, 0, 0, 0, null, 0, 0, 0, null, null, 0, 0, null, null),
('หน้าโรงงาน', 23, '4A', null, true, 'Thu Rein Lin  147 ตูเลลิน', 'อัดเม็ด', 'อัดเม็ด', null, null, 800, 650, 650, 0, 0, 1381, 1412, 31, 248, 8, 0, 1048, null, null),
('หน้าโรงงาน', 24, '4B', null, false, null, null, null, null, null, 0, 0, 0, 0, null, 0, 0, 0, null, null, 0, 0, null, null),
('หน้าโรงงาน', 26, '5A', null, true, 'Saithivy Khamsayasone 137 สายทีวี', 'โค๊ตติ้ง', 'โค๊ตติ้ง', null, null, 800, 1000, 1003, 3, 150, 1363, 1418, 55, 440, 8, 0, 1390, null, null),
('หน้าโรงงาน', 27, '5B', null, false, null, null, null, null, null, 0, 0, 0, 0, 0, 0, 0, 0, null, null, 0, 0, null, null),
('หน้าโรงงาน', 29, '6A', null, true, 'MR.KYAW WEE KOUNG 236', 'เตรียมสาร', 'เตรียมสาร', null, '236', 800, 795, 797, 2, 150, 2609, 2626, 17, 136, 8, 0, 1086, null, null),
('หน้าโรงงาน', 30, '6B', null, false, null, null, null, null, null, 0, 0, 0, null, null, 0, 0, 0, null, null, 0, 0, null, null),
('หน้าโรงงาน', 32, '7A', null, true, 'MISS CHAW SU KHIN 233', 'เยลลี่', 'เยลลี่', null, '233', 800, 974, 979, 5, 150, 3442, 3479, 37, 296, 8, 0, 1246, null, null),
('หน้าโรงงาน', 33, '7B', null, false, null, null, null, null, null, 0, 0, 0, null, null, 0, 0, 0, null, null, 0, 0, null, null),
('หน้าโรงงาน', 35, '8A', null, true, 'MR.MYO MIN HTWE 235', 'สเปรย์ดราย', 'สเปรย์ดราย', null, '235', 800, 653, 658, 5, 150, 7464, 7464, 0, 0, null, 0, 950, null, null),
('หน้าโรงงาน', 36, '8B', null, false, null, null, null, null, null, 0, 0, 0, null, null, 0, 0, 0, null, null, 0, 0, null, null);

-- Rooms
insert into public.rooms(
  property_id, building_id, room_number, floor_number,
  monthly_rent, deposit_amount, status, archived_at, metadata
)
select
  c.property_id,
  b.id,
  s.room_number,
  s.floor_number,
  s.rent_amount,
  0,
  case when s.occupied then 'occupied'::public.room_status else 'vacant'::public.room_status end,
  null,
  jsonb_build_object(
    'legacy_import','2026-06',
    'source_sheet',s.building,
    'source_row',s.source_row,
    'rent_from_legacy',true
  )
from _legacy_current s
cross join _legacy_ctx c
join public.buildings b
  on b.property_id = c.property_id
 and b.name = s.building
on conflict(property_id, room_number)
do update set
  building_id = excluded.building_id,
  floor_number = excluded.floor_number,
  monthly_rent = excluded.monthly_rent,
  status = excluded.status,
  archived_at = null,
  metadata = coalesce(public.rooms.metadata,'{}'::jsonb) || excluded.metadata,
  updated_at = now();

-- Current tenants
insert into public.tenants(
  property_id, full_name, employee_code, department, nationality,
  legacy_key, legacy_metadata, archived_at
)
select
  c.property_id,
  s.tenant_name,
  s.employee_code,
  s.department,
  s.nationality,
  '2026-06|' || s.building || '|' || s.room_number,
  jsonb_build_object(
    'legacy_import','2026-06',
    'source_sheet',s.building,
    'source_row',s.source_row,
    'room_number',s.room_number,
    'raw_group',s.raw_group,
    'review_flag',s.review_flag
  ),
  null
from _legacy_current s
cross join _legacy_ctx c
where s.occupied
  and s.tenant_name is not null
on conflict(property_id, legacy_key) where legacy_key is not null
do update set
  full_name = excluded.full_name,
  employee_code = excluded.employee_code,
  department = excluded.department,
  nationality = excluded.nationality,
  archived_at = null,
  legacy_metadata = coalesce(public.tenants.legacy_metadata,'{}'::jsonb) || excluded.legacy_metadata,
  updated_at = now();

-- Active contracts are required by the current DormPlus UI to connect tenant -> room.
-- The source file does NOT contain reliable start dates or deposits.
-- We therefore use 2026-06-01 as a migration cutover placeholder and flag it explicitly.
insert into public.contracts(
  property_id, room_id, tenant_id, contract_number,
  start_date, end_date, rent_amount, deposit_amount,
  billing_day, due_day, status,
  legacy_start_date_unknown, legacy_deposit_unknown, legacy_source
)
select
  c.property_id,
  r.id,
  t.id,
  'LEG-202606-' || s.building || '-' || s.room_number,
  date '2026-06-01',
  null,
  s.rent_amount,
  0,
  25,
  5,
  'active'::public.contract_status,
  true,
  true,
  jsonb_build_object(
    'legacy_import','2026-06',
    'source_sheet',s.building,
    'source_row',s.source_row,
    'cutover_start_date','2026-06-01',
    'actual_start_date_unknown',true,
    'deposit_unknown',true
  )
from _legacy_current s
cross join _legacy_ctx c
join public.rooms r
  on r.property_id = c.property_id
 and r.room_number = s.room_number
join public.tenants t
  on t.property_id = c.property_id
 and t.legacy_key = '2026-06|' || s.building || '|' || s.room_number
where s.occupied
  and s.tenant_name is not null
on conflict(property_id, contract_number)
do update set
  room_id = excluded.room_id,
  tenant_id = excluded.tenant_id,
  rent_amount = excluded.rent_amount,
  status = 'active',
  legacy_start_date_unknown = true,
  legacy_deposit_unknown = true,
  legacy_source = excluded.legacy_source,
  updated_at = now();

-- Meters
insert into public.meters(property_id, room_id, meter_type, label, metadata)
select c.property_id, r.id, mt.meter_type,
       case mt.meter_type
         when 'water'::public.meter_type then 'มิเตอร์น้ำ'
         else 'มิเตอร์ไฟ'
       end,
       jsonb_build_object('legacy_import','2026-06')
from _legacy_current s
cross join _legacy_ctx c
join public.rooms r
  on r.property_id = c.property_id
 and r.room_number = s.room_number
cross join (
  values ('water'::public.meter_type), ('electricity'::public.meter_type)
) mt(meter_type)
on conflict(property_id, room_id, meter_type)
do update set
  status = 'active',
  metadata = coalesce(public.meters.metadata,'{}'::jsonb) || excluded.metadata,
  updated_at = now();

-- Meter readings: water
insert into public.meter_readings(
  property_id, room_id, meter_id, billing_period,
  previous_reading, current_reading, usage, rate, amount, metadata
)
select
  c.property_id, r.id, m.id, date '2026-06-01',
  s.water_previous, s.water_current, s.water_usage, 28, s.water_amount,
  jsonb_build_object(
    'legacy_import','2026-06',
    'source_sheet',s.building,
    'source_row',s.source_row,
    'minimum_charge',150,
    'service_fee',10,
    'legacy_formula','0 if usage=0 else max(150, usage*28+10)',
    'review_flag',s.review_flag
  )
from _legacy_current s
cross join _legacy_ctx c
join public.rooms r
  on r.property_id = c.property_id
 and r.room_number = s.room_number
join public.meters m
  on m.property_id = c.property_id
 and m.room_id = r.id
 and m.meter_type = 'water'
on conflict(meter_id, billing_period)
do update set
  previous_reading = excluded.previous_reading,
  current_reading = excluded.current_reading,
  usage = excluded.usage,
  rate = excluded.rate,
  amount = excluded.amount,
  metadata = excluded.metadata;

-- Meter readings: electricity
insert into public.meter_readings(
  property_id, room_id, meter_id, billing_period,
  previous_reading, current_reading, usage, rate, amount, metadata
)
select
  c.property_id, r.id, m.id, date '2026-06-01',
  s.electricity_previous, s.electricity_current, s.electricity_usage,
  coalesce(s.electricity_rate, 8),
  s.electricity_amount,
  jsonb_build_object(
    'legacy_import','2026-06',
    'source_sheet',s.building,
    'source_row',s.source_row,
    'legacy_header_rate',8,
    'review_flag',s.review_flag
  )
from _legacy_current s
cross join _legacy_ctx c
join public.rooms r
  on r.property_id = c.property_id
 and r.room_number = s.room_number
join public.meters m
  on m.property_id = c.property_id
 and m.room_id = r.id
 and m.meter_type = 'electricity'
on conflict(meter_id, billing_period)
do update set
  previous_reading = excluded.previous_reading,
  current_reading = excluded.current_reading,
  usage = excluded.usage,
  rate = excluded.rate,
  amount = excluded.amount,
  metadata = excluded.metadata;

-- Preserve June-2026 charges exactly as a legacy snapshot.
-- We intentionally DO NOT create canonical invoices/payments because payment status
-- and real due dates are not present in the source workbook.
insert into public.legacy_billing_snapshots(
  property_id, room_id, tenant_id, billing_period,
  rent_amount,
  water_previous, water_current, water_usage, water_amount,
  electricity_previous, electricity_current, electricity_usage, electricity_rate, electricity_amount,
  other_charge, total_due,
  source_sheet, source_row, raw_group, note, review_flag, metadata
)
select
  c.property_id,
  r.id,
  t.id,
  date '2026-06-01',
  s.rent_amount,
  s.water_previous, s.water_current, s.water_usage, s.water_amount,
  s.electricity_previous, s.electricity_current, s.electricity_usage, s.electricity_rate, s.electricity_amount,
  s.other_charge, s.total_due,
  s.building, s.source_row, s.raw_group, s.note, s.review_flag,
  jsonb_build_object(
    'legacy_import','2026-06',
    'source_file','ค่าหอพัก 6 มิ.ย 69.xlsx'
  )
from _legacy_current s
cross join _legacy_ctx c
join public.rooms r
  on r.property_id = c.property_id
 and r.room_number = s.room_number
left join public.tenants t
  on t.property_id = c.property_id
 and t.legacy_key = '2026-06|' || s.building || '|' || s.room_number
on conflict(property_id, room_id, billing_period)
do update set
  tenant_id = excluded.tenant_id,
  rent_amount = excluded.rent_amount,
  water_previous = excluded.water_previous,
  water_current = excluded.water_current,
  water_usage = excluded.water_usage,
  water_amount = excluded.water_amount,
  electricity_previous = excluded.electricity_previous,
  electricity_current = excluded.electricity_current,
  electricity_usage = excluded.electricity_usage,
  electricity_rate = excluded.electricity_rate,
  electricity_amount = excluded.electricity_amount,
  other_charge = excluded.other_charge,
  total_due = excluded.total_due,
  source_sheet = excluded.source_sheet,
  source_row = excluded.source_row,
  raw_group = excluded.raw_group,
  note = excluded.note,
  review_flag = excluded.review_flag,
  metadata = excluded.metadata;

-- ---------------------------------------------------------------------------
-- Historical residents / exit history
-- ---------------------------------------------------------------------------
create temp table _legacy_history (
  source_sheet text,
  source_row int,
  inferred_building text,
  room_number text,
  full_name text,
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
  note text,
  mapping_note text
) on commit drop;

insert into _legacy_history values
('หอเก่า', 58, 'หอเก่า', '318', 'คุณธานินทร์   สมทัศน์', 'อัดเม็ด', 800, 1223, 1233, 10, 290, 3912, 3991, 79, 632, 300, 2022, null, null),
('หอเก่า', 59, 'หอเก่า', '318', 'คุณจิรศักดิ์  บำรุงชัย', 'เยลลี่', 500, 1223, 1223, 0, 0, 3998, 3998, 0, 0, null, 500, 'เดือน ก.ค คิดเงิน', null),
('หอเก่า', 60, 'หอเก่า', '104', 'คุณมงคล ทับลา', 'บุคคล', 800, 1210, 1211, 1, 150, 930, 960, 30, 270, null, 1220, null, null),
('หอเก่า', 61, 'หอเก่า', '208', 'คุณ ดอกรัก ประสบคุณ', 'เยลลี่', 800, 1235, 1238, 3, 150, 611, 632, 21, 168, null, 1118, null, null),
('หอเก่า', 62, 'หอเก่า', '103', 'คุณสมยงค์ เหล่าศรี', 'รีดซอง', 800, 630, 729, 99, 2782, 8630, 8719, 89, 712, null, 4294, '10.007', null),
('หอเก่า', 63, 'หน้าโรงงาน', '8A', 'Htet ko oo (เท็นโกทู)102', null, 800, 532, 533, 1, 150, 5303, 5311, 8, 64, 250, 1264, 'ลูกบิดประตูชำรุด', 'ย้ายอาคารตามรูปแบบเลขห้อง'),
('หอเก่า', 65, 'หอเก่า', '309', 'คุณชรินทร์  บัวแก้ว', 'ช็อคโกแลต', 800, 938, 942, 4, 150, 6498, 6528, 30, 240, 850, 2040, 'ปรับลาออกไม่แจ้งล่วงหน้า', null),
('หอเก่า', 66, 'หอใน', 'B11', '101. Ko Ko Tue (โกโกทู)', 'Myanmar', 700, 1593, 1595, 2, 150, 2003, 2021, 18, 144, 1250, 2244, 'ปรับไม่คืนกุญแจ+ปรับค่าห้อง', 'ย้ายอาคารตามรูปแบบเลขห้อง'),
('หอเก่า', 67, 'หน้าโรงงาน', '5A', 'zin ko ko (ซินโกโก) 103', null, 800, 696, 696, 0, 0, 5793, 5803, 10, 80, 900, 1780, 'ปรับค่าห้อง', 'ย้ายอาคารตามรูปแบบเลขห้อง'),
('หอเก่า', 69, 'หอเก่า', '310', 'คุณธีระพัฒน์  ชัยมนตรี', 'เยลลี่', 800, 703, 705, 2, 150, 1220, 1252, 32, 288, null, 1238, 'แอร์ 9 บาท', null),
('หอเก่า', 70, 'หอใน', 'D2', 'min thu (มินตู) 111', null, 500, 10, 11, 1, 150, 3740, 3748, 8, 64, 1050, 1764, null, 'ย้ายอาคารตามรูปแบบเลขห้อง'),
('หอเก่า', 71, 'หอใน', 'D3', 'Khin Maung Htwe(คินมองเท)92', 'ช็อคฯ', 500, 426, 427, 1, 150, 3566, 3574, 8, 64, 1050, 1764, null, 'ย้ายอาคารตามรูปแบบเลขห้อง'),
('หอเก่า', 72, 'หอเก่า', '216', 'คุณธวัลรัตน์  รัตน์วิสัย', 'ขาย', 800, 426, 426, 0, 0, 5847, 5850, 3, 24, null, 824, 'แม่ไก่เข้า15/4/2565', null),
('หอเก่า', 73, 'หอใน', 'B9', 'คุณชลทิศ  เขามะหิงษ์', 'ขาย', 600, 1234, 1236, 2, 150, 7410, 7413, 3, 24, null, 774, null, 'ย้ายอาคารตามรูปแบบเลขห้อง'),
('หอเก่า', 74, 'หอเก่า', '216', 'คุณวันเพ็ญ ชวนเชย', 'หีบห่อ2', 800, 440, 441, 1, 150, 6034, 6058, 24, 192, null, 1142, 'แม่ไก่เข้า15/4/2565', null),
('หอเก่า', 76, 'หอเก่า', '101', 'คุณปิตุภูมิ  เจริญยิ่ง', 'อัดเม็ด', 400, 693, 696, 3, 150, 5470, 5497, 27, 216, null, 766, null, null),
('หอเก่า', 77, 'หอเก่า', '316', 'คุณติ่งคำ', null, 400, 920, 924, 4, 150, 7858, 7889, 31, 248, null, 798, null, null),
('หอเก่า', 78, 'หอเก่า', '205', 'คุณสุขสันต์', 'หีบห่อ1', 534, 1959, 1966, 7, 206, 8567, 8567, 0, 0, null, 740, null, null),
('หอใน', 58, 'หอใน', 'B2', 'Saw Are  Ni  (อา นี) 72', 'Myanmar', 400, 651, 658, 7, 206, 4502, 4515, 13, 104, null, 710, 'กักตัว14 วัน', null),
('หอใน', 59, 'หอใน', 'C1', 'Nyo Nyo Than (โย โย ตัน ) 109', 'Myanmar', 400, 824, 825, 1, 150, 6447, 6457, 10, 80, null, 630, 'กักตัว 14 วัน', null),
('หอใน', 60, 'หอใน', 'A4', 'Thiha Zaw  (ตีห้า ซอ)43', 'Myanmar', 800, 1026, 1029, 3, 150, 5716, 5738, 22, 176, 1050, 2176, 'ปรับ 21 วัน', null),
('หอใน', 61, 'หอใน', 'D2', 'min thu (มินตู) 111', null, 500, 10, 11, 1, 150, 3740, 3748, 8, 64, 1050, 1764, null, null),
('หอใน', 62, 'หอใน', 'D3', 'Khin Maung Htwe(คินมองเท)92', 'ช็อคฯ', 500, 426, 427, 1, 150, 3566, 3574, 8, 64, 1050, 1764, null, null),
('หอใน', 63, 'หอใน', 'D3', 'MR.SHIN THANT KO KO 227', 'Myanmar', 500, 642, 649, 7, 206, 4847, 4925, 78, 624, null, 1330, null, null),
('หอใน', 64, 'หอใน', 'C10', 'วิน โม จอ', 'เตรียมสาร', 600, 1171, 1181, 10, 290, 9838, 9893, 55, 440, null, 1330, null, null),
('หอใน', 65, 'หอใน', 'B5', 'Michael Ri  145', 'Myanmar', 200, 20, 20, 0, 0, 7165, 7176, 11, 88, 500, 788, null, null),
('หน้าโรงงาน', 49, 'หน้าโรงงาน', '8A', 'Htet ko oo (เท็นโกทู)102', null, 800, 532, 533, 1, 150, 5303, 5311, 8, 64, 250, 1264, 'ออก29/7/64 | ลูกบิดประตูชำรุด', null),
('หน้าโรงงาน', 50, 'หน้าโรงงาน', '6A', 'Aung Naing Oo (อองไนอู)71', null, 800, 389, 397, 8, 234, 4387, 4426, 39, 312, 100, 1446, 'ออก13/8/2564 | ใช้กูญแจเบอร์2ล็อค | รอเอามาคืน', null),
('หน้าโรงงาน', 51, 'หน้าโรงงาน', '7A', 'Min Thu       มิน ตู 16', null, 800, 471, 473, 2, 150, 4691, 4695, 4, 32, 1200, 2182, 'ออก22/9/2564 | ปรับ24 วัน', null),
('หน้าโรงงาน', 52, 'หน้าโรงงาน', '11', 'คุณศราวุ บุญเรือง', 'พป.', 0, 1, 2, 1, 150, 3005, 3019, 14, 112, null, 262, null, null),
('หน้าโรงงาน', 53, 'หน้าโรงงาน', '2', 'คุณธนโชติ   ต่างท้วม', 'เตรียมผง', 1500, 0, 0, 0, 0, 5837, 5989, 152, 1216, null, 2716, 'หัก1400คืนกุหลาบ', null),
('หน้าโรงงาน', 54, 'หน้าโรงงาน', '8A', 'MR.SAW AHLAR 217 ( มะระ)', 'เตรียมสาร', 400, 651, 651, 0, 0, 7463, 7464, 1, 8, null, 408, null, null);

insert into public.legacy_tenant_history(
  property_id, legacy_key, inferred_building, room_number, full_name, raw_group,
  rent_amount,
  water_previous, water_current, water_usage, water_amount,
  electricity_previous, electricity_current, electricity_usage, electricity_amount,
  other_charge, total_due,
  source_sheet, source_row, note, mapping_note,
  metadata
)
select
  c.property_id,
  '2026-06-history|' || h.source_sheet || '|' || h.source_row::text || '|' || h.room_number,
  h.inferred_building,
  h.room_number,
  h.full_name,
  h.raw_group,
  h.rent_amount,
  h.water_previous, h.water_current, h.water_usage, h.water_amount,
  h.electricity_previous, h.electricity_current, h.electricity_usage, h.electricity_amount,
  h.other_charge, h.total_due,
  h.source_sheet, h.source_row, h.note, h.mapping_note,
  jsonb_build_object('legacy_import','2026-06')
from _legacy_history h
cross join _legacy_ctx c
on conflict(property_id, legacy_key)
do update set
  inferred_building = excluded.inferred_building,
  room_number = excluded.room_number,
  full_name = excluded.full_name,
  raw_group = excluded.raw_group,
  rent_amount = excluded.rent_amount,
  total_due = excluded.total_due,
  note = excluded.note,
  mapping_note = excluded.mapping_note,
  metadata = excluded.metadata;

-- ---------------------------------------------------------------------------
-- Known data-quality / reconciliation issues
-- ---------------------------------------------------------------------------
create temp table _legacy_issues (
  issue_key text,
  severity text,
  category text,
  entity text,
  finding text,
  recommendation text
) on commit drop;

insert into _legacy_issues values
('summary-total-mismatch', 'high', 'สรุปรายได้', 'ยอดรวมทั้งระบบ', 'สรุปรายได้ในไฟล์เดิมแสดง 118,755 บาท แต่ยอดระดับห้องรวม 117,309 บาท ต่าง 1,446 บาท ซึ่งตรงกับรายการคุณพิมพ์ใจ', 'ใช้ยอดระดับห้องเป็น source of truth และตรวจสูตรสรุปเดิมที่มีแนวโน้มนับซ้ำ'),
('electric-room-315', 'high', 'มิเตอร์ไฟ', 'หอเก่า ห้อง 315', 'ใช้ไฟ 15 หน่วย แต่ยอดค่าไฟ 12 บาท ทำให้อัตราที่คำนวณได้ 0.8 บาท/หน่วย ขณะที่เรตส่วนใหญ่ 8 บาท', 'ตรวจเอกสารต้นฉบับก่อนแก้ยอด ห้ามปรับอัตโนมัติ'),
('water-formula', 'medium', 'ค่าน้ำ', 'ทุกอาคาร', 'สูตร legacy คือ 0 บาทเมื่อใช้ 0 หน่วย และเมื่อมีการใช้คิด max(150, usage*28+10)', 'ระบบใหม่เก็บ water_rate=28, minimum_charge=150, service_fee=10'),
('electric-rate-variance', 'medium', 'มิเตอร์ไฟ', 'หลายห้อง', 'พบหลายรายการคิดไฟ 9 บาท/หน่วย และมี 1 รายการผิดปกติ 0.8 บาท/หน่วย', 'เก็บ rate ต่อ meter reading แทนการบังคับใช้เรตเดียวกับทุกห้อง'),
('water-name-error-107', 'medium', 'ค่าน้ำ', 'หอเก่า ห้อง 107', 'water_amount ในไฟล์เดิมเป็น #NAME? แต่ usage 7 หน่วยให้ยอดตามสูตร legacy เท่ากับ 206 บาท', 'Importer เก็บ 206 บาทพร้อม review flag เพื่อให้ตรวจสอบภายหลัง'),
('contract-start-unknown', 'medium', 'สัญญา', 'ผู้พักปัจจุบัน', 'ไฟล์เดิมไม่มีวันเริ่มสัญญาที่เชื่อถือได้ แต่ DormPlus บังคับ start_date', 'Importer ใช้ 2026-06-01 เป็น cutover placeholder และตั้ง legacy_start_date_unknown=true'),
('deposit-unknown', 'medium', 'สัญญา', 'ผู้พักปัจจุบัน', 'ไฟล์เดิมไม่มีข้อมูลเงินประกันที่เชื่อถือได้', 'Importer ใช้ deposit_amount=0 และตั้ง legacy_deposit_unknown=true'),
('billing-not-canonical', 'medium', 'การเงิน', 'งวด 2026-06', 'ยังไม่ทราบสถานะชำระเงินจริงและวันครบกำหนดของใบแจ้งหนี้เดิม', 'เก็บยอดไว้ใน legacy_billing_snapshots และยังไม่สร้าง canonical invoices/payments เพื่อไม่ให้ Dashboard แสดงยอดค้างผิด'),
('key-sheet-A1', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง A1', 'ใบคิดค่าหอ: Nay La Min     เน ลา มิน 6 | ใบเซ็นรับกุญแจ: MR.Kyaw Z ( 218 )', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-A2', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง A2', 'ใบคิดค่าหอ: คุณชำนาญ  อวดอ้าง | ใบเซ็นรับกุญแจ: คุณสุเวทย์', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-A6', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง A6', 'ใบคิดค่าหอ: คุณสุวิทย์  ภูวงษี | ใบเซ็นรับกุญแจ: คุณสุวิทย์', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-B11', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง B11', 'ใบคิดค่าหอ: (ว่าง) | ใบเซ็นรับกุญแจ: Ko Ko TUE โกโกทู', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-B2', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง B2', 'ใบคิดค่าหอ: Khin Khin Htwe (136) | ใบเซ็นรับกุญแจ: Khin Khin Htwe เคเคทวย 136', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-B8', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง B8', 'ใบคิดค่าหอ: (ว่าง) | ใบเซ็นรับกุญแจ: คุณชนมชนก  เทศวงษ์', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-C10', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง C10', 'ใบคิดค่าหอ: ลาอู 150 | ใบเซ็นรับกุญแจ: Aung The The 140', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-C9', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง C9', 'ใบคิดค่าหอ: จอ ตู ซู | ใบเซ็นรับกุญแจ: Nyo Nyo Than (โย โย ตัน ) 109', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-D3', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง D3', 'ใบคิดค่าหอ: MR.SHIN THANT KO KO 227 | ใบเซ็นรับกุญแจ: KAUNG KHANT THAR  193', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-D6', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง D6', 'ใบคิดค่าหอ: (ว่าง) | ใบเซ็นรับกุญแจ: Thet mar lwin เท็ท มา ลุย', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-D7', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง D7', 'ใบคิดค่าหอ: MR.MAUNG AYE WIN เอ มอง วิน 225 | ใบเซ็นรับกุญแจ: Lin Htet Phyoe  รินทัทเพียว', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด'),
('key-sheet-D8', 'medium', 'ผู้พัก/กุญแจ', 'หอใน ห้อง D8', 'ใบคิดค่าหอ: เค มอ ชิน | ใบเซ็นรับกุญแจ: Kyaw Thu Soe (จอ ตู ซอ) 114', 'ยืนยันผู้พักปัจจุบันก่อนแก้ข้อมูล; Importer ใช้ใบคิดค่าหอเป็นฐานของงวดล่าสุด');

insert into public.legacy_import_issues(
  property_id, issue_key, billing_period, severity, category, entity,
  finding, recommendation, status, metadata
)
select
  c.property_id,
  i.issue_key,
  date '2026-06-01',
  i.severity,
  i.category,
  i.entity,
  i.finding,
  i.recommendation,
  'open',
  jsonb_build_object('legacy_import','2026-06')
from _legacy_issues i
cross join _legacy_ctx c
on conflict(property_id, issue_key)
do update set
  billing_period = excluded.billing_period,
  severity = excluded.severity,
  category = excluded.category,
  entity = excluded.entity,
  finding = excluded.finding,
  recommendation = excluded.recommendation,
  metadata = excluded.metadata;

-- ---------------------------------------------------------------------------
-- Import audit + hard validation
-- ---------------------------------------------------------------------------
insert into public.audit_logs(
  property_id, actor_id, action, entity_type, entity_id, new_data
)
select
  c.property_id,
  c.owner_id,
  'LEGACY_IMPORT_202606',
  'legacy_import',
  'CVP-LEGACY-202606',
  jsonb_build_object(
    'source_file','ค่าหอพัก 6 มิ.ย 69.xlsx',
    'rooms_expected',110,
    'current_tenants_expected',86,
    'meter_readings_expected',220,
    'billing_snapshots_expected',110,
    'history_expected',32,
    'canonical_invoices_created',0,
    'notes','Contracts use cutover placeholder start_date=2026-06-01; legacy billing preserved separately.'
  )
from _legacy_ctx c;

do $$
declare
  v_property_id uuid;
  v_rooms int;
  v_tenants int;
  v_contracts int;
  v_readings int;
  v_snapshots int;
  v_history int;
begin
  select property_id into v_property_id from _legacy_ctx limit 1;

  select count(*) into v_rooms
  from public.rooms
  where property_id = v_property_id
    and metadata->>'legacy_import' = '2026-06';

  select count(*) into v_tenants
  from public.tenants
  where property_id = v_property_id
    and legacy_key like '2026-06|%';

  select count(*) into v_contracts
  from public.contracts
  where property_id = v_property_id
    and legacy_source->>'legacy_import' = '2026-06';

  select count(*) into v_readings
  from public.meter_readings
  where property_id = v_property_id
    and billing_period = date '2026-06-01'
    and metadata->>'legacy_import' = '2026-06';

  select count(*) into v_snapshots
  from public.legacy_billing_snapshots
  where property_id = v_property_id
    and billing_period = date '2026-06-01';

  select count(*) into v_history
  from public.legacy_tenant_history
  where property_id = v_property_id
    and legacy_key like '2026-06-history|%';

  if v_rooms <> 110 then
    raise exception 'Legacy import validation failed: rooms=% expected=110', v_rooms;
  end if;
  if v_tenants <> 86 then
    raise exception 'Legacy import validation failed: tenants=% expected=86', v_tenants;
  end if;
  if v_contracts <> 86 then
    raise exception 'Legacy import validation failed: contracts=% expected=86', v_contracts;
  end if;
  if v_readings <> 220 then
    raise exception 'Legacy import validation failed: meter_readings=% expected=220', v_readings;
  end if;
  if v_snapshots <> 110 then
    raise exception 'Legacy import validation failed: billing_snapshots=% expected=110', v_snapshots;
  end if;
  if v_history <> 32 then
    raise exception 'Legacy import validation failed: history=% expected=32', v_history;
  end if;
end
$$;

commit;

-- Final verification result shown by Supabase SQL Editor.
select
  p.id as property_id,
  p.name as project_name,
  (select count(*) from public.buildings b where b.property_id = p.id) as buildings,
  (select count(*) from public.rooms r where r.property_id = p.id and r.metadata->>'legacy_import'='2026-06') as imported_rooms,
  (select count(*) from public.tenants t where t.property_id = p.id and t.legacy_key like '2026-06|%') as imported_current_tenants,
  (select count(*) from public.contracts c where c.property_id = p.id and c.legacy_source->>'legacy_import'='2026-06') as imported_active_contracts,
  (select count(*) from public.meter_readings mr where mr.property_id = p.id and mr.billing_period=date '2026-06-01' and mr.metadata->>'legacy_import'='2026-06') as imported_meter_readings,
  (select count(*) from public.legacy_billing_snapshots lb where lb.property_id = p.id and lb.billing_period=date '2026-06-01') as imported_billing_snapshots,
  (select count(*) from public.legacy_tenant_history lh where lh.property_id = p.id and lh.legacy_key like '2026-06-history|%') as imported_history,
  (select count(*) from public.legacy_import_issues li where li.property_id = p.id and li.status='open') as open_review_issues
from public.properties p
where p.code = 'CVP-LEGACY-202606'
order by p.created_at desc
limit 1;
