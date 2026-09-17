import { NextRequest, NextResponse } from 'next/server';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchNotification } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const channel = String(body.channel || '') as 'inapp' | 'line' | 'discord' | 'telegram';
  if (!propertyId || !['inapp','line','discord','telegram'].includes(channel)) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 });
  }

  const userClient = await createUserClient();
  const admin = createAdminClient();
  if (!userClient || !admin) return NextResponse.json({ error: 'Supabase server credentials are not configured' }, { status: 500 });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: member } = await admin.from('property_members').select('role').eq('property_id', propertyId).eq('user_id', user.id).maybeSingle();
  if (!member || member.role !== 'owner') return NextResponse.json({ error: 'เฉพาะ Owner เท่านั้นที่ทดสอบช่องทางได้' }, { status: 403 });
  const { data: property } = await admin.from('properties').select('name').eq('id', propertyId).single();

  const result = await dispatchNotification(admin, {
    propertyId,
    eventKey: 'test',
    title: 'ทดสอบการแจ้งเตือน DormPlus',
    body: `ช่องทาง ${channel.toUpperCase()} ของโครงการ ${property?.name || 'DormPlus'} ทำงานแล้ว`,
    severity: 'success',
    userId: channel === 'inapp' ? user.id : null,
    channels: [channel],
  });

  if (result.failed.length) return NextResponse.json({ error: result.failed[0].error, result }, { status: 502 });
  if (!result.sent.length) return NextResponse.json({ error: 'ช่องทางนี้ถูกปิดใช้งานหรือยังไม่ได้ตั้งค่า', result }, { status: 400 });
  return NextResponse.json({ ok: true, result });
}
