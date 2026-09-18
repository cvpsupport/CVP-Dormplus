import { NextRequest, NextResponse } from 'next/server';
import { hasAccess, requirePropertyAccess } from '@/lib/access-control';
import { buildSnapshot, deleteStoredSnapshot, loadSnapshot, restoreSnapshot, snapshotCounts, storeSnapshot } from '@/lib/backups';

export const runtime = 'nodejs';
export const maxDuration = 60;

function rowCountSummary(counts: Record<string, number>) {
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
}

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get('propertyId') || '';
  const snapshotId = request.nextUrl.searchParams.get('snapshotId') || '';
  const download = request.nextUrl.searchParams.get('download') === '1';
  if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });

  const auth = await requirePropertyAccess(propertyId, 'backup.view');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (download) {
    if (!snapshotId) return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
    const { data: row, error } = await auth.admin.from('backup_snapshots').select('*').eq('id', snapshotId).eq('property_id', propertyId).single();
    if (error || !row?.storage_path) return NextResponse.json({ error: error?.message || 'ไม่พบ backup' }, { status: 404 });
    const file = await auth.admin.storage.from('dormplus-backups').download(row.storage_path);
    if (file.error || !file.data) return NextResponse.json({ error: file.error?.message || 'ดาวน์โหลดไม่สำเร็จ' }, { status: 500 });
    const bytes = await file.data.arrayBuffer();
    const date = String(row.created_at || '').slice(0, 10) || 'snapshot';
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="dormplus-backup-${date}-${snapshotId.slice(0,8)}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const { data, error } = await auth.admin
    .from('backup_snapshots')
    .select('id,status,backup_type,storage_path,include_files,data_bytes,file_count,table_counts,note,error_message,created_by,created_at,restored_by,restored_at')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data || [], canManage: hasAccess(auth.access, 'backup.manage'), isOwner: auth.access.isOwner });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const action = String(body.action || '');
  if (!propertyId || !action) return NextResponse.json({ error: 'ข้อมูลคำสั่งไม่ครบ' }, { status: 400 });

  const auth = await requirePropertyAccess(propertyId, 'backup.manage');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Restore/delete are intentionally owner-only even if a custom role is accidentally
  // granted backup.manage. Create backup may be delegated through RBAC.
  if (['restore','delete'].includes(action) && !auth.access.isOwner) {
    return NextResponse.json({ error: 'เฉพาะ Owner เท่านั้นที่ Restore หรือลบ Backup ได้' }, { status: 403 });
  }

  try {
    if (action === 'create') {
      const includeFiles = Boolean(body.includeFiles);
      const note = String(body.note || '').trim().slice(0, 500);
      const id = crypto.randomUUID();
      const created = await auth.admin.from('backup_snapshots').insert({
        id, property_id: propertyId, status: 'creating', include_files: includeFiles,
        note: note || null, created_by: auth.user.id,
      });
      if (created.error) throw new Error(created.error.message);
      try {
        const snapshot = await buildSnapshot(auth.admin, propertyId, includeFiles, id);
        const stored = await storeSnapshot(auth.admin, snapshot, id);
        const counts = snapshotCounts(snapshot);
        const successfulFiles = snapshot.files.filter(file => !file.error).length;
        const { error: updateError } = await auth.admin.from('backup_snapshots').update({
          status: 'ready', storage_path: stored.path, data_bytes: stored.bytes,
          file_count: successfulFiles, table_counts: counts, error_message: null,
        }).eq('id', id);
        if (updateError) throw new Error(updateError.message);
        await auth.admin.from('audit_logs').insert({
          property_id: propertyId, actor_id: auth.user.id, action: 'CREATE_BACKUP',
          entity_type: 'backup_snapshot', entity_id: id,
          new_data: { include_files: includeFiles, rows: rowCountSummary(counts), files: successfulFiles },
        });
        return NextResponse.json({ ok: true, id, counts, files: successfulFiles });
      } catch (error) {
        await auth.admin.from('backup_snapshots').update({
          status: 'failed', error_message: error instanceof Error ? error.message : 'Backup failed',
        }).eq('id', id);
        throw error;
      }
    }

    if (action === 'restore') {
      const snapshotId = String(body.snapshotId || '');
      const confirmation = String(body.confirmation || '');
      if (!snapshotId || confirmation !== 'RESTORE') return NextResponse.json({ error: 'ต้องยืนยันด้วยคำว่า RESTORE' }, { status: 400 });
      const { data: target, error } = await auth.admin.from('backup_snapshots').select('*').eq('id', snapshotId).eq('property_id', propertyId).single();
      if (error || !target?.storage_path) return NextResponse.json({ error: error?.message || 'ไม่พบ backup' }, { status: 404 });
      if (target.status !== 'ready') return NextResponse.json({ error: 'Backup นี้ยังไม่พร้อม Restore' }, { status: 400 });

      // Automatic safety snapshot before destructive restore.
      const safetyId = crypto.randomUUID();
      const safetyCreated = await auth.admin.from('backup_snapshots').insert({
        id: safetyId, property_id: propertyId, status: 'creating', include_files: true,
        note: `AUTO ก่อน Restore ${snapshotId.slice(0,8)}`, created_by: auth.user.id,
      });
      if (safetyCreated.error) throw new Error(safetyCreated.error.message);
      try {
        const safety = await buildSnapshot(auth.admin, propertyId, true, safetyId);
        const stored = await storeSnapshot(auth.admin, safety, safetyId);
        await auth.admin.from('backup_snapshots').update({
          status: 'ready', storage_path: stored.path, data_bytes: stored.bytes,
          file_count: safety.files.filter(file => !file.error).length,
          table_counts: snapshotCounts(safety),
        }).eq('id', safetyId);
      } catch (safetyError) {
        await auth.admin.from('backup_snapshots').update({ status: 'failed', error_message: safetyError instanceof Error ? safetyError.message : 'Safety backup failed' }).eq('id', safetyId);
        throw new Error(`สร้าง Safety Backup ก่อน Restore ไม่สำเร็จ: ${safetyError instanceof Error ? safetyError.message : 'unknown error'}`);
      }

      await auth.admin.from('backup_snapshots').update({ status: 'restoring' }).eq('id', snapshotId);
      try {
        const snapshot = await loadSnapshot(auth.admin, target.storage_path);
        if (snapshot.propertyId !== propertyId) throw new Error('Backup นี้ไม่ได้เป็นของโครงการปัจจุบัน');
        await restoreSnapshot(auth.admin, snapshot);
        await auth.admin.from('backup_snapshots').update({
          status: 'ready', restored_by: auth.user.id, restored_at: new Date().toISOString(), error_message: null,
        }).eq('id', snapshotId);
        await auth.admin.from('audit_logs').insert({
          property_id: propertyId, actor_id: auth.user.id, action: 'RESTORE_BACKUP',
          entity_type: 'backup_snapshot', entity_id: snapshotId,
          new_data: { safety_backup_id: safetyId, snapshot_created_at: snapshot.createdAt },
        });
        return NextResponse.json({ ok: true, safetyBackupId: safetyId });
      } catch (restoreError) {
        await auth.admin.from('backup_snapshots').update({
          status: 'ready', error_message: restoreError instanceof Error ? restoreError.message : 'Restore failed',
        }).eq('id', snapshotId);
        throw restoreError;
      }
    }

    if (action === 'delete') {
      const snapshotId = String(body.snapshotId || '');
      if (!snapshotId) return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
      const { data: target, error } = await auth.admin.from('backup_snapshots').select('*').eq('id', snapshotId).eq('property_id', propertyId).single();
      if (error || !target) return NextResponse.json({ error: error?.message || 'ไม่พบ backup' }, { status: 404 });
      if (target.storage_path) {
        const snapshot = await loadSnapshot(auth.admin, target.storage_path);
        await deleteStoredSnapshot(auth.admin, snapshot, target.storage_path);
      }
      const deleted = await auth.admin.from('backup_snapshots').delete().eq('id', snapshotId).eq('property_id', propertyId);
      if (deleted.error) throw new Error(deleted.error.message);
      await auth.admin.from('audit_logs').insert({
        property_id: propertyId, actor_id: auth.user.id, action: 'DELETE_BACKUP',
        entity_type: 'backup_snapshot', entity_id: snapshotId,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
