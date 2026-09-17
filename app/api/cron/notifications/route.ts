import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchNotification } from '@/lib/notifications';

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });

  const now = new Date();
  const today = dateOnly(now);
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
  const horizon = dateOnly(in30);
  let processed = 0;

  const { data: invoices } = await admin
    .from('invoices')
    .select('id,property_id,invoice_number,due_date,total,status')
    .in('status', ['issued','partially_paid','overdue'])
    .lte('due_date', horizon)
    .order('due_date');

  for (const invoice of invoices || []) {
    const { data: rule } = await admin.from('notification_rules').select('enabled,days_before').eq('property_id', invoice.property_id).eq('event_key','invoice_due').maybeSingle();
    if (rule?.enabled === false) continue;
    const trigger = new Date(`${invoice.due_date}T00:00:00Z`); trigger.setUTCDate(trigger.getUTCDate() - Number(rule?.days_before ?? 3));
    if (today < dateOnly(trigger)) continue;
    await dispatchNotification(admin, {
      propertyId: invoice.property_id,
      eventKey: 'invoice_due',
      title: invoice.due_date < today ? `ใบแจ้งหนี้ ${invoice.invoice_number} เกินกำหนด` : `ใบแจ้งหนี้ ${invoice.invoice_number} ใกล้ครบกำหนด`,
      body: `ยอด ฿${Number(invoice.total).toLocaleString()} · ครบกำหนด ${invoice.due_date}`,
      severity: invoice.due_date < today ? 'error' : 'warning',
      entityType: 'invoice', entityId: invoice.id,
      dedupeKey: `invoice_due:${invoice.id}:${invoice.due_date}`,
    });
    processed++;
  }

  const { data: contracts } = await admin
    .from('contracts')
    .select('id,property_id,contract_number,end_date,status')
    .eq('status','active')
    .not('end_date','is',null)
    .gte('end_date',today)
    .lte('end_date',horizon)
    .order('end_date');

  for (const contract of contracts || []) {
    const { data: rule } = await admin.from('notification_rules').select('enabled,days_before').eq('property_id', contract.property_id).eq('event_key','contract_expiring').maybeSingle();
    if (rule?.enabled === false || !contract.end_date) continue;
    const trigger = new Date(`${contract.end_date}T00:00:00Z`); trigger.setUTCDate(trigger.getUTCDate() - Number(rule?.days_before ?? 30));
    if (today < dateOnly(trigger)) continue;
    await dispatchNotification(admin, {
      propertyId: contract.property_id,
      eventKey: 'contract_expiring',
      title: `สัญญา ${contract.contract_number} ใกล้หมดอายุ`,
      body: `วันสิ้นสุดสัญญา ${contract.end_date}`,
      severity: 'warning',
      entityType: 'contract', entityId: contract.id,
      dedupeKey: `contract_expiring:${contract.id}:${contract.end_date}`,
    });
    processed++;
  }

  return NextResponse.json({ ok: true, date: today, processed });
}
