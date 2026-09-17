import { NextRequest, NextResponse } from 'next/server';
import { createClient as createUserClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchNotification } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const eventKey = String(body.eventKey || 'general');
  const title = String(body.title || '').trim();
  const message = String(body.body || '').trim();
  if (!propertyId || !title || !message) return NextResponse.json({ error: 'ข้อมูลแจ้งเตือนไม่ครบ' }, { status: 400 });

  const userClient = await createUserClient();
  const admin = createAdminClient();
  if (!userClient || !admin) return NextResponse.json({ error: 'Supabase server credentials are not configured' }, { status: 500 });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: member } = await admin.from('property_members').select('role').eq('property_id', propertyId).eq('user_id', user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงโครงการนี้' }, { status: 403 });

  const result = await dispatchNotification(admin, {
    propertyId,
    eventKey,
    title,
    body: message,
    severity: ['info','success','warning','error'].includes(body.severity) ? body.severity : 'info',
    entityType: body.entityType ? String(body.entityType) : null,
    entityId: body.entityId ? String(body.entityId) : null,
    dedupeKey: body.dedupeKey ? String(body.dedupeKey) : null,
  });
  return NextResponse.json({ ok: result.failed.length === 0, result }, { status: result.failed.length ? 207 : 200 });
}
