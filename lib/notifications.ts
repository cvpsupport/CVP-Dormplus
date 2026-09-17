import type { SupabaseClient } from '@supabase/supabase-js';

type ChannelName = 'inapp' | 'line' | 'discord' | 'telegram';

type ChannelRow = {
  id: string;
  property_id: string;
  channel: ChannelName;
  enabled: boolean;
  label: string | null;
  config: Record<string, unknown> | null;
};

type SecretRow = { secret: Record<string, unknown> | null } | null;

export type DispatchInput = {
  propertyId: string;
  eventKey: string;
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
  userId?: string | null;
  channels?: ChannelName[];
};

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function sendLine(config: Record<string, unknown>, secret: Record<string, unknown>, message: string) {
  const token = asString(secret.channel_access_token);
  const target = asString(config.target_id);
  if (!token || !target) throw new Error('LINE ยังไม่ได้ตั้งค่า Channel access token หรือ Target ID');
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: target, messages: [{ type: 'text', text: message }] }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`LINE ${response.status}: ${text || 'ส่งข้อความไม่สำเร็จ'}`);
  return text || '200 OK';
}

async function sendDiscord(secret: Record<string, unknown>, message: string) {
  const webhookUrl = asString(secret.webhook_url);
  if (!/^https:\/\/(?:canary\.|ptb\.)?(?:discord\.com|discordapp\.com)\/api\/webhooks\//i.test(webhookUrl)) {
    throw new Error('Discord Webhook URL ไม่ถูกต้อง');
  }
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message, username: 'DormPlus' }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord ${response.status}: ${text || 'ส่งข้อความไม่สำเร็จ'}`);
  return text || '204 No Content';
}

async function sendTelegram(config: Record<string, unknown>, secret: Record<string, unknown>, message: string) {
  const token = asString(secret.bot_token);
  const chatId = asString(config.chat_id);
  if (!token || !chatId) throw new Error('Telegram ยังไม่ได้ตั้งค่า Bot Token หรือ Chat ID');
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('Telegram Bot Token รูปแบบไม่ถูกต้อง');
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Telegram ${response.status}: ${text || 'ส่งข้อความไม่สำเร็จ'}`);
  return text || '200 OK';
}

export async function dispatchNotification(admin: SupabaseClient, input: DispatchInput) {
  let selectedChannels = input.channels;

  if (!selectedChannels) {
    const { data: rule } = await admin
      .from('notification_rules')
      .select('enabled,channels')
      .eq('property_id', input.propertyId)
      .eq('event_key', input.eventKey)
      .maybeSingle();

    if (rule && rule.enabled === false) return { sent: [], failed: [], skipped: ['rule-disabled'] };
    selectedChannels = ((rule?.channels || ['inapp']) as ChannelName[]).filter(Boolean);
  }

  const uniqueChannels = Array.from(new Set(selectedChannels || []));
  if (!uniqueChannels.length) return { sent: [], failed: [], skipped: [] };
  const sent: ChannelName[] = [];
  const failed: { channel: ChannelName; error: string }[] = [];
  const skipped: ChannelName[] = [];
  const message = `🏠 ${input.title}\n${input.body}`;

  const { data: rows } = await admin
    .from('notification_channels')
    .select('id,property_id,channel,enabled,label,config')
    .eq('property_id', input.propertyId)
    .in('channel', uniqueChannels);

  const channelMap = new Map(((rows || []) as ChannelRow[]).map(row => [row.channel, row]));

  for (const channel of uniqueChannels) {
    const row = channelMap.get(channel);
    const enabled = channel === 'inapp' ? (row?.enabled ?? true) : Boolean(row?.enabled);
    if (!enabled) {
      skipped.push(channel);
      continue;
    }

    if (input.dedupeKey) {
      const { data: prior } = await admin
        .from('notification_delivery_logs')
        .select('id')
        .eq('property_id', input.propertyId)
        .eq('channel', channel)
        .eq('dedupe_key', input.dedupeKey)
        .eq('status', 'sent')
        .maybeSingle();
      if (prior) {
        skipped.push(channel);
        continue;
      }
    }

    try {
      let responseText = '';
      if (channel === 'inapp') {
        const { error } = await admin.from('notifications').insert({
          property_id: input.propertyId,
          user_id: input.userId || null,
          event_key: input.eventKey,
          title: input.title,
          body: input.body,
          severity: input.severity || 'info',
          entity_type: input.entityType || null,
          entity_id: input.entityId || null,
          metadata: { dedupe_key: input.dedupeKey || null },
        });
        if (error) throw error;
        responseText = 'stored in-app';
      } else {
        if (!row) throw new Error(`ยังไม่ได้ตั้งค่าช่องทาง ${channel}`);
        const { data: secretRow, error: secretError } = await admin
          .from('notification_channel_secrets')
          .select('secret')
          .eq('channel_id', row.id)
          .maybeSingle();
        if (secretError) throw secretError;
        const secret = ((secretRow as SecretRow)?.secret || {}) as Record<string, unknown>;
        const config = (row.config || {}) as Record<string, unknown>;
        if (channel === 'line') responseText = await sendLine(config, secret, message);
        if (channel === 'discord') responseText = await sendDiscord(secret, message);
        if (channel === 'telegram') responseText = await sendTelegram(config, secret, message);
      }

      await admin.from('notification_delivery_logs').insert({
        property_id: input.propertyId,
        channel,
        event_key: input.eventKey,
        entity_type: input.entityType || null,
        entity_id: input.entityId || null,
        dedupe_key: input.dedupeKey || null,
        status: 'sent',
        response_text: responseText.slice(0, 1800),
      });
      sent.push(channel);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      await admin.from('notification_delivery_logs').insert({
        property_id: input.propertyId,
        channel,
        event_key: input.eventKey,
        entity_type: input.entityType || null,
        entity_id: input.entityId || null,
        dedupe_key: input.dedupeKey || null,
        status: 'failed',
        response_text: messageText.slice(0, 1800),
      });
      failed.push({ channel, error: messageText });
    }
  }

  return { sent, failed, skipped };
}
