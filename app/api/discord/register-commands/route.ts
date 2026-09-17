import { NextRequest, NextResponse } from 'next/server';
import { requirePropertyAccess } from '@/lib/access-control';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });

  const auth = await requirePropertyAccess(propertyId, 'settings.manage');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!applicationId || !botToken) return NextResponse.json({ error: 'ยังไม่ได้ตั้ง DISCORD_APPLICATION_ID / DISCORD_BOT_TOKEN ใน Vercel' }, { status: 503 });

  const { data: mappings, error: mappingError } = await auth.admin.from('discord_meter_channels').select('guild_id').eq('property_id', propertyId).eq('enabled', true);
  if (mappingError) return NextResponse.json({ error: mappingError.message }, { status: 500 });
  const guildIds = Array.from(new Set((mappings || []).map(row => row.guild_id).filter(Boolean)));
  if (!guildIds.length) return NextResponse.json({ error: 'กรุณาบันทึก Guild ID / Channel ID ก่อน' }, { status: 400 });

  const commonOptions = (meterLabel: string) => [
    { type: 3, name: 'room', description: 'เลขห้อง เช่น 102', required: true },
    { type: 10, name: 'reading', description: `เลข${meterLabel}ปัจจุบัน เช่น 1239`, required: true, min_value: 0 },
    { type: 11, name: 'photo', description: `รูปหน้าปัด${meterLabel}`, required: true },
  ];

  const commands = [
    {
      name: 'water',
      description: 'ส่งเลขและรูปมิเตอร์น้ำ เพื่อรอผู้ดูแลอนุมัติ',
      options: commonOptions('มิเตอร์น้ำ'),
    },
    {
      name: 'electric',
      description: 'ส่งเลขและรูปมิเตอร์ไฟ เพื่อรอผู้ดูแลอนุมัติ',
      options: commonOptions('มิเตอร์ไฟ'),
    },
  ];

  const registered: string[] = [];
  for (const guildId of guildIds) {
    for (const command of commands) {
      const res = await fetch(`https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`, {
        method: 'POST',
        headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Discord register ${command.name} failed: ${res.status} ${text.slice(0, 400)}` }, { status: 502 });
      }
      registered.push(`${guildId}/${command.name}`);
    }
  }
  return NextResponse.json({ ok: true, registered });
}
