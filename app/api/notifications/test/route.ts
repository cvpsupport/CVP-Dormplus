import { NextRequest, NextResponse } from 'next/server';
import { requirePropertyAccess } from '@/lib/access-control';
import { dispatchNotification } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const channel = String(body.channel || '') as 'inapp' | 'line' | 'discord' | 'telegram';
  if (!propertyId || !['inapp','line','discord','telegram'].includes(channel)) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 });
  }

  const auth = await requirePropertyAccess(propertyId, 'notifications.manage');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data: property } = await auth.admin.from('properties').select('name').eq('id', propertyId).single();

  const result = await dispatchNotification(auth.admin, {
    propertyId,
    eventKey: 'test',
    title: 'ทดสอบการแจ้งเตือน DormPlus',
    body: `ช่องทาง ${channel.toUpperCase()} ของโครงการ ${property?.name || 'DormPlus'} ทำงานแล้ว`,
    severity: 'success',
    userId: channel === 'inapp' ? auth.user.id : null,
    channels: [channel],
  });

  if (result.failed.length) return NextResponse.json({ error: result.failed[0].error, result }, { status: 502 });
  if (!result.sent.length) return NextResponse.json({ error: 'ช่องทางนี้ถูกปิดใช้งานหรือยังไม่ได้ตั้งค่า', result }, { status: 400 });
  return NextResponse.json({ ok: true, result });
}
