import { NextRequest, NextResponse } from 'next/server';
import { requirePropertyAccess } from '@/lib/access-control';

const supported = new Set(['inapp', 'line', 'discord', 'telegram']);

async function authProperty(propertyId: string, manage = false) {
  return requirePropertyAccess(propertyId, manage ? 'notifications.manage' : 'notifications.view');
}


export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get('propertyId') || '';
  if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
  const auth = await authProperty(propertyId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: channels, error } = await auth.admin
    .from('notification_channels')
    .select('id,channel,enabled,label,config,updated_at')
    .eq('property_id', propertyId)
    .order('channel');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (channels || []).map((row: { id: string }) => row.id);
  const { data: secrets } = ids.length
    ? await auth.admin.from('notification_channel_secrets').select('channel_id').in('channel_id', ids)
    : { data: [] as { channel_id: string }[] };
  const configured = new Set((secrets || []).map((row: { channel_id: string }) => row.channel_id));

  return NextResponse.json({
    channels: (channels || []).map((row: { id:string; channel:string; enabled:boolean; label:string|null; config:Record<string,unknown>; updated_at:string }) => ({ ...row, configured: row.channel === 'inapp' || configured.has(row.id) })),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const channel = String(body.channel || '');
  if (!propertyId || !supported.has(channel)) return NextResponse.json({ error: 'ข้อมูลช่องทางไม่ถูกต้อง' }, { status: 400 });
  const auth = await authProperty(propertyId, true);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const config = typeof body.config === 'object' && body.config ? body.config : {};
  const enabled = Boolean(body.enabled);
  const label = typeof body.label === 'string' ? body.label.trim() || null : null;
  const { data: row, error } = await auth.admin
    .from('notification_channels')
    .upsert({ property_id: propertyId, channel, enabled, label, config, updated_at: new Date().toISOString() }, { onConflict: 'property_id,channel' })
    .select('id,channel,enabled,label,config,updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const secret = typeof body.secret === 'object' && body.secret ? body.secret as Record<string, unknown> : null;
  const hasSecretValue = secret && Object.values(secret).some(value => typeof value === 'string' && value.trim());
  if (body.clearSecret === true) {
    await auth.admin.from('notification_channel_secrets').delete().eq('channel_id', row.id);
  } else if (hasSecretValue) {
    const cleanSecret = Object.fromEntries(Object.entries(secret).filter(([, value]) => typeof value === 'string' && value.trim()));
    const { error: secretError } = await auth.admin
      .from('notification_channel_secrets')
      .upsert({ channel_id: row.id, secret: cleanSecret, updated_at: new Date().toISOString() }, { onConflict: 'channel_id' });
    if (secretError) return NextResponse.json({ error: secretError.message }, { status: 500 });
  }

  const { data: secretExists } = await auth.admin
    .from('notification_channel_secrets')
    .select('channel_id')
    .eq('channel_id', row.id)
    .maybeSingle();

  return NextResponse.json({ channel: { ...row, configured: channel === 'inapp' || Boolean(secretExists) } });
}
