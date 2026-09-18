# Production checklist

## Already covered in application/database
- Supabase RLS + project-scoped RBAC
- Private document storage
- Audit triggers on critical operational tables
- Soft lifecycle instead of hard delete for rooms/tenants/contracts/expenses where applicable
- Closed invoice guard: non-owner users cannot modify invoices from a closed period
- Discord meter submissions require manual approval before entering meter readings

## Configure in Supabase / Vercel before production
1. Enable Supabase Point-in-Time Recovery or scheduled database backups appropriate to your plan.
2. Perform a restore drill into a separate Supabase project before go-live.
3. Configure Supabase Auth password policy, email confirmation and MFA for Owner/Manager accounts.
4. Rotate `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_BOT_TOKEN`, LINE/Telegram tokens if exposed.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only in Vercel Environment Variables.
6. Configure Vercel WAF / rate limiting or an upstream gateway for public webhook/API routes.
7. Review RLS policies after every schema migration.
8. Test checkout, billing closing and payment reversal scenarios in staging before production.

## Web Backup Center (v0.12)

- [ ] รัน `012_web_backup_restore.sql`
- [ ] Owner เห็นเมนู Backup / Restore
- [ ] ทดลองสร้าง Backup แบบรวมไฟล์
- [ ] ดาวน์โหลด JSON เก็บไว้นอก Supabase อย่างน้อย 1 ชุด
- [ ] ทดสอบ Restore ใน Staging ก่อนใช้ Restore กับ Production
- [ ] ยืนยันว่า `SUPABASE_SERVICE_ROLE_KEY` มีเฉพาะ Vercel Server Environment และไม่ขึ้นต้นด้วย `NEXT_PUBLIC_`
- [ ] ยังเปิด Supabase Platform Backup/PITR ตามความเหมาะสม เพราะ Application Backup ไม่ทดแทน Database disaster recovery ทั้งระบบ
