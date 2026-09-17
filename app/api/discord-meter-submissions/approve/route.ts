import { NextRequest, NextResponse } from 'next/server';
import { requirePropertyAccess } from '@/lib/access-control';

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function reviewerAuth(propertyId: string) {
  return requirePropertyAccess(propertyId, 'meters.approve');
}


async function sendDiscordChannelMessage(channelId: string | null, content: string) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !channelId) return;
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
  } catch {
    // Approval must not fail only because Discord notification failed.
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const submissionId = String(body.submissionId || '');
  const action = String(body.action || '');
  const note = String(body.note || '').trim();
  if (!propertyId || !submissionId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'ข้อมูลคำสั่งไม่ครบ' }, { status: 400 });
  }

  const auth = await reviewerAuth(propertyId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: submission, error: submissionError } = await auth.admin
    .from('discord_meter_submissions')
    .select('id,property_id,building_id,room_id,meter_id,meter_type,billing_period,discord_interaction_id,discord_username,channel_id,image_path,submitted_reading,previous_reading,rate,approval_status')
    .eq('id', submissionId)
    .eq('property_id', propertyId)
    .maybeSingle();
  if (submissionError) return NextResponse.json({ error: submissionError.message }, { status: 500 });
  if (!submission) return NextResponse.json({ error: 'ไม่พบรายการที่ส่งมา' }, { status: 404 });
  if (submission.approval_status !== 'pending') return NextResponse.json({ error: 'รายการนี้ถูกตรวจสอบไปแล้ว' }, { status: 409 });

  const reviewedAt = new Date().toISOString();

  const { data: room } = submission.room_id
    ? await auth.admin.from('rooms').select('room_number').eq('id', submission.room_id).maybeSingle()
    : { data: null };
  const roomNumber = room?.room_number || '-';
  const typeLabel = submission.meter_type === 'water' ? 'น้ำ' : 'ไฟ';

  if (action === 'reject') {
    const reviewNote = note || 'ผู้ดูแลไม่อนุมัติรายการนี้';
    const { error } = await auth.admin
      .from('discord_meter_submissions')
      .update({
        approval_status: 'rejected',
        status: 'review',
        reviewed_by: auth.user.id,
        reviewed_at: reviewedAt,
        review_note: reviewNote,
        processed_at: reviewedAt,
      })
      .eq('id', submissionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sendDiscordChannelMessage(submission.channel_id, `❌ **ผู้ดูแลไม่อนุมัติมิเตอร์${typeLabel} ห้อง ${roomNumber}**\nเลขที่ส่ง: ${num(submission.submitted_reading).toLocaleString('th-TH')}\nเหตุผล: ${reviewNote}`);
    return NextResponse.json({ ok: true, approvalStatus: 'rejected' });
  }

  if (!submission.room_id || !submission.meter_id || !submission.billing_period || submission.submitted_reading == null) {
    return NextResponse.json({ error: 'รายการนี้มีข้อมูลไม่ครบ จึงอนุมัติไม่ได้' }, { status: 400 });
  }

  const currentReading = num(submission.submitted_reading);
  const [{ data: property, error: propertyError }, { data: existing, error: existingError }, { data: prior, error: priorError }] = await Promise.all([
    auth.admin.from('properties').select('water_rate,water_minimum_charge,water_service_fee,electricity_rate,meter_high_usage_water,meter_high_usage_electricity').eq('id', propertyId).single(),
    auth.admin.from('meter_readings').select('id,previous_reading,current_reading').eq('meter_id', submission.meter_id).eq('billing_period', submission.billing_period).maybeSingle(),
    auth.admin.from('meter_readings').select('current_reading,billing_period').eq('meter_id', submission.meter_id).lt('billing_period', submission.billing_period).order('billing_period', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (priorError) return NextResponse.json({ error: priorError.message }, { status: 500 });

  const previousReading = existing?.previous_reading != null
    ? num(existing.previous_reading)
    : prior?.current_reading != null
      ? num(prior.current_reading)
      : submission.previous_reading != null
        ? num(submission.previous_reading)
        : null;

  if (previousReading != null && currentReading < previousReading) {
    return NextResponse.json({ error: `อนุมัติไม่ได้: เลขปัจจุบัน ${currentReading} ต่ำกว่าครั้งก่อน ${previousReading}` }, { status: 400 });
  }

  const usage = previousReading == null ? null : currentReading - previousReading;
  const rate = submission.meter_type === 'water'
    ? num(submission.rate, num(property.water_rate, 28))
    : num(submission.rate, num(property.electricity_rate, 8));
  const minWater = num(property.water_minimum_charge, 0);
  const waterService = num(property.water_service_fee, 0);
  const amount = usage == null
    ? null
    : submission.meter_type === 'water'
      ? (usage === 0 ? 0 : (minWater > 0 ? Math.max(minWater, usage * rate + waterService) : usage * rate))
      : usage * rate;

  const { data: reading, error: readingError } = await auth.admin
    .from('meter_readings')
    .upsert({
      property_id: propertyId,
      room_id: submission.room_id,
      meter_id: submission.meter_id,
      billing_period: submission.billing_period,
      previous_reading: previousReading,
      current_reading: currentReading,
      usage,
      rate,
      amount,
      source: 'discord-manual',
      source_reference: submission.discord_interaction_id,
      image_path: submission.image_path,
      review_status: 'approved',
      verified_at: reviewedAt,
      metadata: {
        source: 'discord-manual',
        submitted_by: submission.discord_username,
        reviewed_by: auth.user.id,
        review_note: note || null,
        ...(submission.meter_type === 'water' ? { minimum_charge: minWater, service_fee: waterService } : {}),
      },
    }, { onConflict: 'meter_id,billing_period' })
    .select('id')
    .single();
  if (readingError) return NextResponse.json({ error: readingError.message }, { status: 500 });

  const { error: updateError } = await auth.admin
    .from('discord_meter_submissions')
    .update({
      previous_reading: previousReading,
      usage,
      rate,
      amount,
      status: 'saved',
      approval_status: 'approved',
      reviewed_by: auth.user.id,
      reviewed_at: reviewedAt,
      review_note: note || null,
      processed_at: reviewedAt,
      approved_meter_reading_id: reading.id,
    })
    .eq('id', submissionId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const resultLines = [
    `✅ **ผู้ดูแลอนุมัติมิเตอร์${typeLabel} ห้อง ${roomNumber} แล้ว**`,
    previousReading == null ? 'ครั้งก่อน: ไม่มีข้อมูล' : `ครั้งก่อน: ${previousReading.toLocaleString('th-TH')}`,
    `ครั้งนี้: ${currentReading.toLocaleString('th-TH')}`,
    usage == null ? 'ใช้: ยังไม่คำนวณ (ไม่มีเลขครั้งก่อน)' : `ใช้: ${usage.toLocaleString('th-TH')} หน่วย`,
    amount == null ? 'ยอด: ยังไม่คำนวณ' : `ยอด: ฿${amount.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`,
  ];
  await sendDiscordChannelMessage(submission.channel_id, resultLines.join('\n'));

  return NextResponse.json({ ok: true, approvalStatus: 'approved', readingId: reading.id });
}
