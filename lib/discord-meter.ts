import { createAdminClient } from '@/lib/supabase/admin';

type MeterType = 'water' | 'electricity';

type DiscordAttachment = {
  id: string;
  filename: string;
  content_type?: string;
  size?: number;
  url: string;
};

type DiscordInteraction = {
  id: string;
  application_id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user?: { id?: string; username?: string; global_name?: string } };
  user?: { id?: string; username?: string; global_name?: string };
  data?: {
    name?: string;
    options?: Array<{ name: string; type: number; value?: string | number }>;
    resolved?: { attachments?: Record<string, DiscordAttachment> };
  };
};

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function periodInTimezone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-01`;
}

function extensionFromContentType(contentType: string) {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

async function editDiscordReply(applicationId: string, interactionToken: string, content: string) {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
}

async function ensureMeter(admin: NonNullable<ReturnType<typeof createAdminClient>>, propertyId: string, roomId: string, meterType: MeterType) {
  const { data: existing, error: existingError } = await admin
    .from('meters')
    .select('id,room_id,meter_type')
    .eq('property_id', propertyId)
    .eq('room_id', roomId)
    .eq('meter_type', meterType)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await admin
    .from('meters')
    .insert({
      property_id: propertyId,
      room_id: roomId,
      meter_type: meterType,
      label: meterType === 'water' ? 'มิเตอร์น้ำ' : 'มิเตอร์ไฟ',
      status: 'active',
      metadata: { source: 'discord-manual-create' },
    })
    .select('id,room_id,meter_type')
    .single();
  if (error) throw error;
  return data;
}

export async function processDiscordMeterInteraction(interaction: DiscordInteraction) {
  const admin = createAdminClient();
  const applicationId = interaction.application_id || process.env.DISCORD_APPLICATION_ID || '';
  const token = interaction.token;
  const guildId = interaction.guild_id || '';
  const channelId = interaction.channel_id || '';
  const commandName = interaction.data?.name;
  const meterType: MeterType | null = commandName === 'water' ? 'water' : commandName === 'electric' ? 'electricity' : null;

  async function reply(message: string) {
    if (applicationId && token) await editDiscordReply(applicationId, token, message);
  }

  try {
    if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY ยังไม่ได้ตั้งค่า');
    if (!meterType) throw new Error('รองรับเฉพาะ /water และ /electric');
    if (!guildId || !channelId) throw new Error('คำสั่งนี้ต้องใช้ภายใน Discord Server/Channel ที่ผูกกับ DormPlus');

    const roomOption = interaction.data?.options?.find(o => o.name === 'room');
    const readingOption = interaction.data?.options?.find(o => o.name === 'reading');
    const photoOption = interaction.data?.options?.find(o => o.name === 'photo');
    const roomNumber = String(roomOption?.value || '').trim();
    const submittedReading = Number(readingOption?.value);
    const attachmentId = String(photoOption?.value || '');
    const attachment = attachmentId ? interaction.data?.resolved?.attachments?.[attachmentId] : undefined;

    if (!roomNumber || !Number.isFinite(submittedReading) || submittedReading < 0 || !attachment) {
      throw new Error('กรุณาระบุเลขห้อง, เลขมิเตอร์ และแนบรูปให้ครบ');
    }

    const { data: mapping, error: mappingError } = await admin
      .from('discord_meter_channels')
      .select('id,property_id,building_id,enabled')
      .eq('guild_id', guildId)
      .eq('channel_id', channelId)
      .maybeSingle();
    if (mappingError) throw mappingError;
    if (!mapping || !mapping.enabled) throw new Error('Channel นี้ยังไม่ได้ผูกกับโครงการ DormPlus หรือถูกปิดใช้งาน');

    const { data: previousSubmission, error: duplicateError } = await admin
      .from('discord_meter_submissions')
      .select('id,status,approval_status')
      .eq('discord_interaction_id', interaction.id)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (previousSubmission) {
      await reply(`ℹ️ คำสั่งนี้ถูกส่งเข้าระบบแล้ว (สถานะ: ${previousSubmission.approval_status || previousSubmission.status})`);
      return;
    }

    let roomQuery = admin
      .from('rooms')
      .select('id,room_number,building_id,status')
      .eq('property_id', mapping.property_id)
      .eq('room_number', roomNumber)
      .is('archived_at', null);
    if (mapping.building_id) roomQuery = roomQuery.eq('building_id', mapping.building_id);
    const { data: room, error: roomError } = await roomQuery.maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new Error(`ไม่พบห้อง ${roomNumber} ในโครงการ/อาคารที่ผูกกับ Channel นี้`);

    const { data: property, error: propertyError } = await admin
      .from('properties')
      .select('id,name,timezone,water_rate,water_minimum_charge,water_service_fee,electricity_rate')
      .eq('id', mapping.property_id)
      .single();
    if (propertyError) throw propertyError;

    const meter = await ensureMeter(admin, mapping.property_id, room.id, meterType);
    const billingPeriod = periodInTimezone(property.timezone || 'Asia/Bangkok');

    const { data: existingReading, error: existingReadingError } = await admin
      .from('meter_readings')
      .select('id,previous_reading,current_reading')
      .eq('meter_id', meter.id)
      .eq('billing_period', billingPeriod)
      .maybeSingle();
    if (existingReadingError) throw existingReadingError;

    const { data: priorReading, error: priorReadingError } = await admin
      .from('meter_readings')
      .select('current_reading,billing_period')
      .eq('meter_id', meter.id)
      .lt('billing_period', billingPeriod)
      .order('billing_period', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (priorReadingError) throw priorReadingError;

    const previousReading = existingReading?.previous_reading != null
      ? num(existingReading.previous_reading)
      : priorReading?.current_reading != null
        ? num(priorReading.current_reading)
        : null;

    const usage = previousReading == null || submittedReading < previousReading
      ? null
      : submittedReading - previousReading;
    const rate = meterType === 'water' ? num(property.water_rate, 28) : num(property.electricity_rate, 8);
    const waterMinimum = num(property.water_minimum_charge, 0);
    const waterService = num(property.water_service_fee, 0);
    const amount = usage == null
      ? null
      : meterType === 'water'
        ? (usage === 0 ? 0 : (waterMinimum > 0 ? Math.max(waterMinimum, usage * rate + waterService) : usage * rate))
        : usage * rate;

    const reviewReasons: string[] = [];
    if (previousReading == null) reviewReasons.push('ยังไม่มีเลขครั้งก่อน ระบบจะรอผู้ดูแลตรวจสอบก่อนบันทึก');
    if (previousReading != null && submittedReading < previousReading) reviewReasons.push('เลขที่ส่งมาต่ำกว่าเลขครั้งก่อน');
    if (existingReading?.current_reading != null) reviewReasons.push('รอบบิลนี้มีเลขมิเตอร์อยู่แล้ว การอนุมัติจะเป็นการแก้ไขรายการเดิม');

    const allowedHosts = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
    const attachmentUrl = new URL(attachment.url);
    if (!allowedHosts.has(attachmentUrl.hostname)) throw new Error('Attachment URL ไม่ใช่ Discord CDN');
    const imageResponse = await fetch(attachment.url);
    if (!imageResponse.ok) throw new Error(`ดาวน์โหลดรูปจาก Discord ไม่สำเร็จ (${imageResponse.status})`);
    const contentType = imageResponse.headers.get('content-type') || attachment.content_type || 'image/jpeg';
    if (!contentType.startsWith('image/')) throw new Error('ไฟล์แนบต้องเป็นรูปภาพ');
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (buffer.byteLength > 12 * 1024 * 1024) throw new Error('รูปมีขนาดเกิน 12 MB');

    const ext = extensionFromContentType(contentType);
    const path = `${mapping.property_id}/${billingPeriod.slice(0, 7)}/${room.id}/${meterType}/${interaction.id}.${ext}`;
    const { error: uploadError } = await admin.storage.from('meter-photos').upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const user = interaction.member?.user || interaction.user || {};
    const username = user.global_name || user.username || 'Discord user';
    const discordUserId = user.id || null;

    const { error: submissionError } = await admin.from('discord_meter_submissions').insert({
      property_id: mapping.property_id,
      building_id: room.building_id,
      room_id: room.id,
      meter_id: meter.id,
      meter_type: meterType,
      billing_period: billingPeriod,
      discord_interaction_id: interaction.id,
      guild_id: guildId,
      channel_id: channelId,
      discord_user_id: discordUserId,
      discord_username: username,
      attachment_id: attachment.id,
      attachment_filename: attachment.filename,
      image_path: path,
      submitted_reading: submittedReading,
      previous_reading: previousReading,
      usage,
      rate,
      amount,
      status: 'review',
      approval_status: 'pending',
      review_reason: reviewReasons.join(' · ') || null,
      metadata: {
        source: 'discord-manual',
        existing_period_reading: existingReading?.current_reading ?? null,
        attachment_content_type: contentType,
      },
      processed_at: new Date().toISOString(),
    });
    if (submissionError) throw submissionError;

    const typeLabel = meterType === 'water' ? 'น้ำ' : 'ไฟ';
    const lines = [
      '📥 **รับข้อมูลมิเตอร์แล้ว — รอผู้ดูแลอนุมัติ**',
      `${property.name} · ห้อง ${roomNumber} · มิเตอร์${typeLabel}`,
      `เลขที่พิมพ์: **${submittedReading.toLocaleString('th-TH')}**`,
      previousReading == null ? 'ครั้งก่อน: ยังไม่มีข้อมูล' : `ครั้งก่อน: ${previousReading.toLocaleString('th-TH')}`,
      usage == null ? 'หน่วยที่ใช้: รอตรวจสอบ' : `หน่วยที่ใช้: ${usage.toLocaleString('th-TH')} หน่วย`,
      amount == null ? 'ยอดประมาณการ: รอตรวจสอบ' : `ยอดประมาณการ: ฿${amount.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`,
      '',
      'รูปและตัวเลขถูกส่งเข้า DormPlus แล้ว แต่ **ยังไม่ถูกบันทึกเป็นเลขมิเตอร์จริง** จนกว่าผู้ดูแลจะกดอนุมัติ',
    ];
    if (reviewReasons.length) lines.push(`⚠️ ${reviewReasons.join(' · ')}`);
    await reply(lines.join('\n'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await reply(`❌ **ส่งเลขมิเตอร์ไม่สำเร็จ**\n${message}`);
  }
}
