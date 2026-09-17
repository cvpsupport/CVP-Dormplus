# Discord Meter — พิมพ์เลข + แนบรูป + ผู้ดูแลอนุมัติ

เวอร์ชันนี้ **ไม่ใช้ AI / OCR และไม่ต้องมี OPENAI_API_KEY**

## Workflow

พนักงานส่ง:

```text
/water room:102 reading:1239 photo:[รูป]
/electric room:102 reading:2317 photo:[รูป]
```

ระบบจะ:

1. ตรวจ Channel → โครงการ/อาคาร
2. ตรวจเลขห้อง
3. เก็บรูปลง Private Supabase Storage
4. เก็บเลขที่พนักงานพิมพ์เป็น `pending`
5. **ยังไม่เขียน meter_readings**
6. Owner / Manager เปิดหน้า `มิเตอร์น้ำ / ไฟ`
7. ตรวจรูปเทียบเลข แล้วกด `อนุมัติ` หรือ `ไม่อนุมัติ`
8. เมื่ออนุมัติเท่านั้น ระบบจึงบันทึก `meter_readings`
9. Bot ส่งผลอนุมัติ/ไม่อนุมัติกลับเข้า Discord Channel

## Supabase

รัน migration ตามลำดับเดิมจนถึง `008` แล้วรัน:

```text
009_discord_manual_meter_approval.sql
```

## Vercel Environment Variables

```env
DISCORD_APPLICATION_ID=...
DISCORD_PUBLIC_KEY=...
DISCORD_BOT_TOKEN=...
```

ไม่ต้องตั้ง:

```text
OPENAI_API_KEY
OPENAI_VISION_MODEL
```

## Discord commands

หลัง Deploy และรัน migration แล้ว ไปที่ DormPlus → ตั้งค่า → Discord Meter Capture แล้วกด:

**อัปเดต /water และ /electric**

เพื่อให้ Discord เพิ่ม argument `reading` เข้า Slash Command

## ผู้มีสิทธิ์อนุมัติ

- owner
- manager

สมาชิก role อื่นสามารถดูคิวได้ แต่กดอนุมัติไม่ได้
