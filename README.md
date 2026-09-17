# DormPlus Webapp

ต้นแบบ Web App จัดการหอพักจากภาพอ้างอิง โดยใช้ **Next.js + Supabase + Vercel** และออกแบบ Responsive สำหรับ Desktop/Mobile

## สิ่งที่มีให้แล้ว

- Dashboard ภาพรวม
- โมดูลโครงการ / Portfolio สำหรับบริหารหลายหอพัก พร้อมหน้ารายละเอียด อาคาร และงานโครงการ
- จัดการห้องพัก
- รายชื่อผู้เช่า
- การเงิน / ใบแจ้งหนี้
- แจ้งซ่อมแบบ Kanban
- ตั้งค่าหอพักและรอบบิล
- Responsive mobile navigation
- Supabase browser/server clients
- PostgreSQL schema + RLS migration
- Mock data fallback เพื่อเปิด UI ได้ก่อนเชื่อม Supabase


### โมดูลโครงการ

- `/projects` ภาพรวมหลายโครงการ / Portfolio
- `/projects/[id]` รายละเอียดโครงการ อาคาร KPI และงานโครงการ
- ใช้ `properties` เป็น Project entity หลัก เพื่อไม่ให้ข้อมูลซ้ำ
- Migration `002_projects_module.sql` เพิ่ม project metadata, buildings, project_tasks, project_documents และ RPC `create_project()`

## เริ่มใช้งาน

```bash
npm install
cp .env.example .env.local
npm run dev
```

เปิด `http://localhost:3000`

## เชื่อม Supabase

1. สร้าง Supabase project
2. เปิด SQL Editor แล้วรัน migrations ตามลำดับ: `001_initial_schema.sql` และ `002_projects_module.sql`
3. ใส่ค่าใน `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

4. ปรับแต่ละหน้าให้ fetch จาก Supabase แทน `lib/mock-data.ts`

## Deploy Vercel

- Push repository ขึ้น GitHub
- Import project ใน Vercel
- ตั้ง Environment Variables ตาม `.env.example`
- Deploy

## โครงสร้างสำคัญ

```text
app/                 Next.js App Router pages
components/          UI shell + reusable components
lib/mock-data.ts     ข้อมูลตัวอย่างสำหรับ prototype
lib/supabase/        Supabase browser/server clients
supabase/migrations/ Database schema + RLS
```

## หมายเหตุด้านความปลอดภัย

- ห้ามใช้ `SUPABASE_SERVICE_ROLE_KEY` ใน Client Component
- เอกสารผู้เช่า/สลิปควรใช้ private storage bucket + signed URL
- Transaction สำคัญ เช่น ยืนยัน payment, check-out, ปรับยอด invoice ควรทำผ่าน server action/route handler และบันทึก audit log

## UI refresh (v0.2)

เวอร์ชันนี้ปรับหน้าตาใหม่ให้ใกล้ production SaaS มากขึ้น โดยยังคงโครงสร้าง Next.js/Supabase เดิม:

- Sidebar ใหม่ พร้อม active state, portfolio card และ occupancy progress
- Topbar แบบ glass / project switcher / global search placeholder
- Dashboard hero ใหม่ พร้อม KPI และ quick actions
- Stat cards, chart, occupancy card และ activity list ใหม่
- Room cards เปลี่ยนจาก emoji เป็น CSS room illustration
- Project cards, tables, maintenance board และ settings ปรับ spacing / typography / hover state
- Login page แบบ split-screen สำหรับ desktop และ responsive mobile
- Mobile bottom navigation และ responsive layout ปรับใหม่
- ใช้ design tokens กลางใน `app/globals.css` เพื่อเปลี่ยนสี/รัศมี/เงาได้ง่าย
