# DormPlus Web App — Supabase CRUD Edition

DormPlus is a Next.js 15 property-management web app designed for deployment on Vercel with Supabase as the database/auth backend.

## What works in this version

- Supabase Auth: sign in and sign up
- Multi-project workspace and project switcher
- Projects: create, edit, delete
- Project detail: buildings and project tasks CRUD
- Rooms: create, edit, archive/remove from active list
- Tenants: create, edit, archive; optionally create an active contract when assigning a room
- Billing: create, edit, delete invoices based on active contracts
- Maintenance: create, edit, change status, delete
- Settings: edit property profile, billing days, electricity/water rates
- Dashboard: live data from the current project
- RLS remains enabled; browser CRUD runs under the signed-in user's Supabase session

## Environment variables

Create `.env.local` locally, or add these in Vercel → Project → Settings → Environment Variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_NAME=DormPlus
```

`SUPABASE_SERVICE_ROLE_KEY` must never be exposed in browser code or committed to GitHub. The current CRUD UI does not require it in the browser.

## Supabase setup

Open Supabase → SQL Editor and apply migrations in this order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_projects_module.sql`
3. `supabase/migrations/003_crud_support.sql`

If 001 and 002 were already applied, only run 003.

Migration 003 adds safe archival fields for rooms/tenants and an owner-only project delete policy.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## First-use flow

1. Create an account on `/login` or sign in with an existing Supabase user.
2. Go to **โครงการ** and create the first project.
3. Add a building from the project detail page (optional).
4. Add rooms.
5. Add tenants. Selecting a vacant room creates an active rental contract automatically.
6. Go to Billing to create invoices from active contracts.
7. Add maintenance tickets and update their status.

## Deploy to Vercel

Push the repository to GitHub and import it into Vercel. Framework preset should be Next.js. After adding the environment variables, redeploy.

If Supabase email confirmation is enabled, a newly registered user must confirm their email before signing in.

## Authentication (v0.4)

This build includes explicit Supabase Auth route protection:

- `/login` is the public login/signup page.
- Unauthenticated visits to dashboard routes are redirected to `/login` by `middleware.ts`.
- Authenticated visits to `/login` are redirected to `/dashboard`.
- A visible **ออกจากระบบ** button is available in the top bar and in **ตั้งค่า → การเข้าสู่ระบบ**.
- Logout clears the local Supabase session and the active-project browser state.

After deploying this version, set the Supabase **Site URL** to the production Vercel URL under Authentication → URL Configuration.

## Typography update

This build increases typography across the entire web app for better readability on desktop and mobile. Small UI labels, navigation, forms, tables, cards, dialogs, and mobile navigation have all been enlarged. Mobile form controls use a 16px base size to improve legibility and avoid unwanted browser zoom.

## Meter + Notifications (v0.5)

หลังจาก import ข้อมูลเดิมสำเร็จ ให้รัน migration เพิ่มตามลำดับ:

1. `006_split_legacy_projects.sql` — แยก `หอเก่า=โครงการ1`, `หอใน=โครงการ2`, `หน้าโรงงาน=โครงการ3`
2. `007_meter_notifications.sql` — เพิ่มเมนูมิเตอร์, Notification Center, channel settings และ automation rules

Environment Variables บน Vercel ต้องมี:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_NAME=DormPlus
CRON_SECRET=<random-long-secret>
```

เมนู **มิเตอร์น้ำ / ไฟ** รองรับการจดเลขรอบบิล, คำนวณ usage และยอดตามเรตโครงการ, แก้ไขข้อมูลเดิม และแจ้ง `meter_anomaly` เมื่อเกิน threshold ที่ตั้งไว้

หน้า **ตั้งค่า** รองรับ In-App, LINE Official Account Messaging API, Discord Incoming Webhook และ Telegram Bot API. Secrets ถูกเก็บใน `notification_channel_secrets` ซึ่ง authenticated client อ่านไม่ได้; Route Handlers ฝั่ง Server ใช้ `SUPABASE_SERVICE_ROLE_KEY` ในการส่งข้อความ

Vercel Cron เรียก `/api/cron/notifications` ทุกวัน 08:00 น. เวลาไทย (01:00 UTC) เพื่อตรวจใบแจ้งหนี้ใกล้ครบกำหนดและสัญญาใกล้หมดอายุ
