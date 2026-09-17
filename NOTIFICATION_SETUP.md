# DormPlus Notification Setup

## In-App
ไม่ต้องตั้งค่าเพิ่ม เปิดใช้งานได้ทันทีหลังรัน `007_meter_notifications.sql`

## LINE Official Account
DormPlus ใช้ LINE Messaging API (Push Message) ไม่ใช้ LINE Notify

ต้องใช้:
- Channel access token
- Target ID ของผู้ใช้ (`U...`) หรือ Group/Room ID ที่ LINE OA สามารถส่งถึงได้

ใส่ค่าใน DormPlus > ตั้งค่า > ช่องทางแจ้งเตือน > LINE Official Account แล้วกด **บันทึก** และ **ทดสอบ**

## Discord
สร้าง Incoming Webhook ใน Discord Channel ที่ต้องการ แล้วนำ Webhook URL มาใส่ใน DormPlus

DormPlus จะเก็บ Webhook URL ใน `notification_channel_secrets` และไม่ส่ง secret กลับไปยัง Browser

## Telegram
สร้าง Bot จาก BotFather แล้วใช้:
- Bot Token
- Chat ID / Group Chat ID

ใส่ค่าใน DormPlus > ตั้งค่า > Telegram แล้วกด **ทดสอบ**

## Vercel Cron
เพิ่ม Environment Variable:

```env
CRON_SECRET=<random-long-secret>
```

`vercel.json` จะเรียก `/api/cron/notifications` ทุกวัน 01:00 UTC (08:00 Asia/Bangkok)
เพื่อแจ้ง:
- invoice_due
- contract_expiring

เหตุการณ์จากหน้าเว็บ:
- maintenance_new: ส่งเมื่อสร้างงานแจ้งซ่อม
- meter_anomaly: ส่งเมื่อบันทึก usage เกิน threshold ของโครงการ

`payment_received` เตรียม Rule ไว้แล้ว แต่จะเริ่มส่งอัตโนมัติเมื่อเพิ่ม workflow รับชำระ/ยืนยัน Payment ในหน้าเว็บ
