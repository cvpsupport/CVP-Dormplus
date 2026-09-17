import { NextRequest, NextResponse } from 'next/server';
import { requirePropertyAccess } from '@/lib/access-control';

async function managerAuth(propertyId: string) {
  return requirePropertyAccess(propertyId, 'settings.manage');
}


export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get('propertyId') || '';
  if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
  const auth = await managerAuth(propertyId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin
    .from('discord_meter_channels')
    .select('id,property_id,building_id,guild_id,channel_id,enabled,updated_at')
    .eq('property_id', propertyId)
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    mappings: data || [],
    configured: {
      applicationId: Boolean(process.env.DISCORD_APPLICATION_ID),
      publicKey: Boolean(process.env.DISCORD_PUBLIC_KEY),
      botToken: Boolean(process.env.DISCORD_BOT_TOKEN),
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const guildId = String(body.guildId || '').trim();
  const channelId = String(body.channelId || '').trim();
  const buildingId = body.buildingId ? String(body.buildingId) : null;
  if (!propertyId || !guildId || !channelId) return NextResponse.json({ error: 'กรอก Guild ID และ Channel ID ให้ครบ' }, { status: 400 });

  const auth = await managerAuth(propertyId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (buildingId) {
    const { data: building } = await auth.admin.from('buildings').select('id').eq('id', buildingId).eq('property_id', propertyId).maybeSingle();
    if (!building) return NextResponse.json({ error: 'อาคารไม่อยู่ในโครงการนี้' }, { status: 400 });
  }

  const { data: conflict } = await auth.admin
    .from('discord_meter_channels')
    .select('id,property_id')
    .eq('guild_id', guildId)
    .eq('channel_id', channelId)
    .maybeSingle();
  if (conflict && conflict.property_id !== propertyId) return NextResponse.json({ error: 'Discord Channel นี้ถูกผูกกับโครงการอื่นแล้ว' }, { status: 409 });

  const payload = {
    property_id: propertyId,
    building_id: buildingId,
    guild_id: guildId,
    channel_id: channelId,
    enabled: body.enabled !== false,
    auto_save_confidence: 0.98, // legacy compatibility; manual workflow never auto-saves.
    created_by: auth.user.id,
    updated_at: new Date().toISOString(),
  };
  const result = conflict
    ? await auth.admin.from('discord_meter_channels').update(payload).eq('id', conflict.id).select().single()
    : await auth.admin.from('discord_meter_channels').insert(payload).select().single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ mapping: result.data });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const id = String(body.id || '');
  if (!propertyId || !id) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 });
  const auth = await managerAuth(propertyId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { error } = await auth.admin.from('discord_meter_channels').delete().eq('id', id).eq('property_id', propertyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
