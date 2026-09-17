# DormPlus Users / Roles / Permissions

เวอร์ชันนี้เพิ่ม RBAC แบบแยกตามโครงการ โดยผู้ใช้หนึ่งบัญชีสามารถมี Role ต่างกันในแต่ละโครงการได้

## ติดตั้ง

1. ถ้ายังไม่ได้ใช้ Discord manual meter approval ให้รัน migration 009 ก่อน
2. รัน `supabase/migrations/010_users_roles_permissions.sql` ใน Supabase SQL Editor
3. Deploy source เวอร์ชันนี้ขึ้น Vercel
4. ตรวจว่ามี Environment Variable ฝั่ง Server:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Logout / Login ใหม่หนึ่งครั้ง หรือ Refresh หน้าเว็บ
6. เปิดเมนู **ผู้ใช้ / Role / สิทธิ์**

## Role มาตรฐาน

- Owner — สิทธิ์ทั้งหมด และล็อก Role ไว้เพื่อป้องกันการตัดสิทธิ์เจ้าของระบบ
- Manager — งานบริหารประจำวัน ผู้ใช้งาน ตั้งค่า และการแจ้งเตือน (ค่าเริ่มต้นไม่ให้แก้แบบ Role)
- Accountant — การเงิน ใบแจ้งหนี้ การชำระ และข้อมูลที่เกี่ยวข้อง
- Staff — ห้อง ผู้เช่า งานแจ้งซ่อม และจดมิเตอร์
- Technician — งานแจ้งซ่อมและจดมิเตอร์

Owner สามารถแก้ Permission ของ Manager / Accountant / Staff / Technician ได้ และสร้าง Custom Role เพิ่มเองได้

## ผู้ใช้งาน

ปุ่ม **เพิ่มผู้ใช้งาน** รองรับสองกรณี:

- อีเมลยังไม่มีใน Supabase Auth: ระบบสร้าง Auth user พร้อมรหัสผ่านชั่วคราว
- อีเมลมีบัญชีอยู่แล้ว: ระบบเพิ่มบัญชีนั้นเข้าโครงการ โดยไม่สร้าง Auth user ซ้ำ

ปุ่ม **ลบออก** จะลบ membership เฉพาะโครงการปัจจุบัน ไม่ลบ Auth account เพื่อไม่กระทบโครงการอื่น

## Security

- `SUPABASE_SERVICE_ROLE_KEY` ใช้เฉพาะ Route Handler ฝั่ง Server
- Browser ไม่ได้รับ service role key
- RLS ของห้อง ผู้เช่า สัญญา การเงิน แจ้งซ่อม มิเตอร์ การแจ้งเตือน และโครงการ ถูกผูกกับ Permission
- ผู้ที่มี `users.manage` ไม่สามารถให้ Role ที่มีสิทธิ์สูงกว่าตัวเองได้
- เฉพาะ Owner เท่านั้นที่กำหนด/ถอด Owner
- Owner คนสุดท้ายไม่สามารถถูกถอดออกจากโครงการ
- Custom Role ลบได้เมื่อไม่มีผู้ใช้งานผูกอยู่
- System Role ลบไม่ได้ แต่ปรับ Permission ได้ ยกเว้น Owner

## เมนูและ Permission หลัก

เมนูจะแสดงตามสิทธิ์ `*.view` ของแต่ละโมดูล และปุ่ม เพิ่ม/แก้ไข/ลบ จะซ่อนตาม Permission ที่เกี่ยวข้อง

ตัวอย่าง:

- `rooms.view`, `rooms.create`, `rooms.update`, `rooms.delete`
- `tenants.view`, `tenants.create`, `tenants.update`, `tenants.delete`
- `billing.view`, `billing.create`, `billing.update`, `billing.delete`, `billing.verify`
- `maintenance.view`, `maintenance.create`, `maintenance.update`, `maintenance.delete`, `maintenance.assign`
- `meters.view`, `meters.record`, `meters.approve`
- `users.view`, `users.manage`
- `roles.view`, `roles.manage`
- `settings.view`, `settings.manage`
- `notifications.view`, `notifications.manage`
