# DormPlus v0.12 — Web Backup / Restore

## ติดตั้ง

1. Supabase SQL Editor: รัน `supabase/migrations/012_web_backup_restore.sql`
2. อัป source เวอร์ชัน v0.12 ไป GitHub / Vercel
3. ตรวจ Vercel Environment Variables ว่ามี:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Server only)
4. Login ด้วย Owner แล้วเปิดเมนู `Backup / Restore`

## Backup จากเว็บ

กด `สร้าง Backup ตอนนี้` และเลือก `รวมไฟล์หลักฐาน` เมื่อต้องการสำรอง:

- เอกสารใน bucket `dormplus-documents`
- รูปมิเตอร์ใน bucket `meter-photos`

Snapshot JSON และสำเนาไฟล์จะถูกเก็บใน private bucket `dormplus-backups`.

## Restore จากเว็บ

- Restore จำกัดเฉพาะ Owner
- ก่อน Restore ทุกครั้ง ระบบสร้าง Safety Backup ปัจจุบันให้อัตโนมัติ
- ผู้ใช้ต้องพิมพ์ `RESTORE` เพื่อยืนยัน
- Restore จะคืนข้อมูลปฏิบัติการ เช่น ห้อง ผู้เช่า สัญญา มิเตอร์ บิล การชำระ เอกสาร งานซ่อม และข้อมูล Legacy
- Restore จะไม่ย้อน Auth, User/Role, Password, Integration Secret, Notification history และ Audit Log

## สิ่งที่ Backup Center ไม่ทดแทน

เมนูนี้เป็น Application Backup สำหรับ DormPlus ไม่ใช่ physical database backup/PITR ของ Supabase. ควรเปิด Platform Backup/PITR หรือเก็บ SQL dump นอกระบบสำหรับ disaster recovery ระดับฐานข้อมูลด้วย.

## สิทธิ์

Permission ใหม่:

- `backup.view`
- `backup.manage`

Owner ได้สิทธิ์โดยอัตโนมัติ. Custom Role สามารถกำหนดผ่าน `ผู้ใช้ / Role / สิทธิ์` ได้. Restore/Delete ถูกบังคับให้ Owner เท่านั้นที่ API อีกชั้นหนึ่ง.
