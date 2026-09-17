import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { after } from 'next/server';
import { NextRequest, NextResponse } from 'next/server';
import { processDiscordMeterInteraction } from '@/lib/discord-meter';

export const runtime = 'nodejs';
export const maxDuration = 60;

function verifyDiscordRequest(rawBody: string, signatureHex: string, timestamp: string, publicKeyHex: string) {
  try {
    const rawKey = Buffer.from(publicKeyHex, 'hex');
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const key = createPublicKey({ key: Buffer.concat([spkiPrefix, rawKey]), format: 'der', type: 'spki' });
    return verifySignature(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-signature-ed25519') || '';
  const timestamp = request.headers.get('x-signature-timestamp') || '';
  const publicKey = process.env.DISCORD_PUBLIC_KEY || '';
  const rawBody = await request.text();

  if (!signature || !timestamp || !publicKey || !verifyDiscordRequest(rawBody, signature, timestamp, publicKey)) {
    return new NextResponse('invalid request signature', { status: 401 });
  }

  const interaction = JSON.parse(rawBody);
  if (interaction.type === 1) return NextResponse.json({ type: 1 });
  if (interaction.type !== 2 || !['water', 'electric'].includes(interaction.data?.name)) {
    return NextResponse.json({ type: 4, data: { content: 'รองรับเฉพาะ /water และ /electric', flags: 64 } });
  }

  after(() => processDiscordMeterInteraction(interaction));
  return NextResponse.json({
    type: 5,
    data: { flags: 64 },
  });
}
