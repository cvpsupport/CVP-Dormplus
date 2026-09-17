import { NextRequest, NextResponse } from 'next/server';
import { requirePropertyAccess } from '@/lib/access-control';
import { dispatchNotification } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const eventKey = String(body.eventKey || 'general');
  const title = String(body.title || '').trim();
  const message = String(body.body || '').trim();
  if (!propertyId || !title || !message) return NextResponse.json({ error: 'ข้อมูลแจ้งเตือนไม่ครบ' }, { status: 400 });

  const requiredPermission = eventKey === 'maintenance_new'
    ? 'maintenance.create'
    : eventKey === 'meter_anomaly'
      ? 'meters.record'
      : 'notifications.manage';
  const auth = await requirePropertyAccess(propertyId, requiredPermission);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await dispatchNotification(auth.admin, {
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
