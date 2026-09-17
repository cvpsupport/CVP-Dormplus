# DormPlus Legacy Import — June 2026

ไฟล์ชุดนี้สร้างจาก `ค่าหอพัก 6 มิ.ย 69.xlsx`

## ข้อมูลที่จะนำเข้า

- 1 โครงการ: `CHAVANAPHAT CO.,LTD`
- 3 อาคาร: หอเก่า, หอใน, หน้าโรงงาน
- 110 ห้อง/ยูนิต
- 86 ผู้พักปัจจุบัน
- 86 active contracts เพื่อให้หน้า Tenant ของ DormPlus แสดงห้องได้
- 220 meter readings (น้ำ + ไฟ ต่อห้อง)
- 110 legacy billing snapshots ของงวด June 2026
- 32 รายการประวัติคนออก
- รายการจุดตรวจสอบข้อมูลเดิม เช่นยอดสรุปไม่ตรง, เรตไฟผิดปกติ, รายชื่อใบรับกุญแจไม่ตรง

## วิธีรัน

1. สำรองฐานข้อมูลก่อน
2. Supabase > SQL Editor
3. รัน `004_legacy_import_support.sql`
4. รัน `005_import_legacy_june_2026.sql`
5. ถ้ามี Auth user มากกว่า 1 บัญชี ให้แก้บรรทัด `owner_email` ใน `_legacy_config` จาก `null` เป็นอีเมลบัญชีที่ใช้ Login DormPlus
6. เมื่อสำเร็จ ตารางผลลัพธ์ท้าย script ต้องแสดง:
   - imported_rooms = 110
   - imported_current_tenants = 86
   - imported_active_contracts = 86
   - imported_meter_readings = 220
   - imported_billing_snapshots = 110
   - imported_history = 32

## การตัดสินใจด้านข้อมูลที่ importer ใช้

### สัญญา
ไฟล์เดิมไม่มีวันเริ่มสัญญาที่เชื่อถือได้ แต่ UI ปัจจุบันต้องใช้ contract เพื่อผูก Tenant กับ Room
จึงใช้ `2026-06-01` เป็น **cutover placeholder** และกำหนด:

- `legacy_start_date_unknown = true`
- `legacy_deposit_unknown = true`
- `deposit_amount = 0`

ห้ามตีความ `2026-06-01` ว่าเป็นวันเริ่มเช่าจริง

### การเงิน
ยังไม่ทราบสถานะชำระจริงและวันครบกำหนดของยอด June 2026
ดังนั้น importer **ไม่สร้าง canonical invoices/payments** เพื่อไม่ให้ Dashboard แสดง “ยอดค้าง” หรือ “รับชำระแล้ว” แบบผิดข้อเท็จจริง

ยอดเดิมถูกเก็บครบใน:

- `legacy_billing_snapshots`
- `meter_readings`

### ค่าน้ำ
ข้อมูลเดิมใช้แนวคิด:

- 0 หน่วย = 0 บาท
- มีการใช้ = `max(150, usage * 28 + 10)`

โปรเจกต์ import จะตั้ง:

- `water_rate = 28`
- `water_minimum_charge = 150`
- `water_service_fee = 10`

### ค่าไฟ
ค่าไฟส่วนใหญ่ 8 บาท/หน่วย แต่มีรายการ 9 บาท/หน่วยและรายการผิดปกติ
จึงเก็บ `rate` จริงต่อ `meter_readings` และสร้างรายการ review ไว้

## หลัง Import

เปิด DormPlus แล้วเลือกโครงการ `CHAVANAPHAT CO.,LTD`

ควรเห็น:
- Dashboard: 110 ห้อง, 86 ผู้เช่า, occupancy ประมาณ 78%
- Rooms: ห้องว่าง/มีผู้เช่าตามไฟล์เดิม
- Tenants: ผู้พักปัจจุบันผูกกับห้องผ่าน active contract

Dashboard การเงินจะยังเป็น 0 จนกว่าจะสร้าง canonical invoice/payment ใหม่ ซึ่งเป็นพฤติกรรมที่ตั้งใจไว้เพื่อไม่สร้างข้อมูลการชำระเท็จจากไฟล์เดิม
