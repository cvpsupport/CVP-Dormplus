import { NextRequest, NextResponse } from 'next/server';
import { requirePropertyAccess, hasAccess } from '@/lib/access-control';

async function memberAuth(propertyId: string) {
  return requirePropertyAccess(propertyId, 'meters.view');
}


export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get('propertyId') || '';
  const buildingId = request.nextUrl.searchParams.get('buildingId') || '';
  if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });

  const auth = await memberAuth(propertyId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let query = auth.admin
    .from('discord_meter_submissions')
    .select('id,property_id,building_id,room_id,meter_id,meter_type,billing_period,discord_user_id,discord_username,attachment_filename,image_path,submitted_reading,previous_reading,usage,rate,amount,status,approval_status,review_reason,created_at,channel_id')
    .eq('property_id', propertyId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100);
  if (buildingId) query = query.eq('building_id', buildingId);

  const { data: submissions, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roomIds = Array.from(new Set((submissions || []).map(row => row.room_id).filter(Boolean)));
  const buildingIds = Array.from(new Set((submissions || []).map(row => row.building_id).filter(Boolean)));

  const [roomsRes, buildingsRes] = await Promise.all([
    roomIds.length ? auth.admin.from('rooms').select('id,room_number').in('id', roomIds) : Promise.resolve({ data: [], error: null }),
    buildingIds.length ? auth.admin.from('buildings').select('id,name').in('id', buildingIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (roomsRes.error) return NextResponse.json({ error: roomsRes.error.message }, { status: 500 });
  if (buildingsRes.error) return NextResponse.json({ error: buildingsRes.error.message }, { status: 500 });

  const roomMap = new Map((roomsRes.data || []).map(row => [row.id, row.room_number]));
  const buildingMap = new Map((buildingsRes.data || []).map(row => [row.id, row.name]));

  const rows = await Promise.all((submissions || []).map(async row => {
    let imageUrl: string | null = null;
    if (row.image_path) {
      const { data } = await auth.admin.storage.from('meter-photos').createSignedUrl(row.image_path, 600);
      imageUrl = data?.signedUrl || null;
    }
    return {
      ...row,
      room_number: row.room_id ? roomMap.get(row.room_id) || '-' : '-',
      building_name: row.building_id ? buildingMap.get(row.building_id) || '-' : '-',
      image_url: imageUrl,
    };
  }));

  return NextResponse.json({
    submissions: rows,
    canReview: hasAccess(auth.access, 'meters.approve'),
    role: auth.access.roleName,
  });
}
