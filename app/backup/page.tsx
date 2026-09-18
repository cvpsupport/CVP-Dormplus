'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, StatCard } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useWorkspace } from '@/lib/workspace';

type BackupRow = {
  id: string;
  status: 'creating'|'ready'|'restoring'|'failed';
  include_files: boolean;
  data_bytes: number;
  file_count: number;
  table_counts: Record<string, number> | null;
  note: string | null;
  error_message: string | null;
  created_at: string;
  restored_at: string | null;
};

function formatBytes(value: number) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function totalRows(counts: Record<string, number> | null) {
  return Object.values(counts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function statusBadge(status: BackupRow['status']) {
  if (status === 'ready') return <Badge tone="green">พร้อม</Badge>;
  if (status === 'creating') return <Badge tone="blue">กำลังสร้าง</Badge>;
  if (status === 'restoring') return <Badge tone="amber">กำลัง Restore</Badge>;
  return <Badge tone="red">ผิดพลาด</Badge>;
}

export default function BackupPage() {
  const w = useWorkspace();
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    if (!w.activePropertyId) return;
    const response = await fetch(`/api/backups?propertyId=${encodeURIComponent(w.activePropertyId)}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || 'โหลด Backup ไม่สำเร็จ');
      return;
    }
    setRows(data.snapshots || []);
    setCanManage(Boolean(data.canManage));
    setIsOwner(Boolean(data.isOwner));
  }

  useEffect(() => { void load(); }, [w.activePropertyId]);

  const stats = useMemo(() => {
    const ready = rows.filter(row => row.status === 'ready').length;
    const withFiles = rows.filter(row => row.status === 'ready' && row.include_files).length;
    const latest = rows.find(row => row.status === 'ready') || null;
    return { ready, withFiles, latest };
  }, [rows]);

  async function run(action: string, payload: Record<string, unknown>) {
    if (!w.activePropertyId) return null;
    setBusy(action);
    setMessage('');
    try {
      const response = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: w.activePropertyId, action, ...payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'ดำเนินการไม่สำเร็จ');
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function createBackup() {
    const data = await run('create', { includeFiles, note });
    if (!data) return;
    setNote('');
    setMessage(`สร้าง Backup สำเร็จ${data.files ? ` · สำรองไฟล์ ${data.files} ไฟล์` : ''}`);
    await load();
  }

  async function restoreBackup(row: BackupRow) {
    const first = window.confirm(`Restore Backup วันที่ ${new Date(row.created_at).toLocaleString('th-TH')}?\n\nระบบจะสร้าง Safety Backup อัตโนมัติก่อน แล้วแทนที่ข้อมูลปฏิบัติการของโครงการปัจจุบัน`);
    if (!first) return;
    const confirmation = window.prompt('เพื่อป้องกันการกดผิด พิมพ์คำว่า RESTORE');
    if (confirmation !== 'RESTORE') {
      setMessage('ยกเลิก Restore เพราะคำยืนยันไม่ถูกต้อง');
      return;
    }
    const data = await run('restore', { snapshotId: row.id, confirmation });
    if (!data) return;
    setMessage(`Restore สำเร็จ · Safety Backup: ${String(data.safetyBackupId || '').slice(0,8)}`);
    await load();
    await w.refresh();
  }

  async function deleteBackup(row: BackupRow) {
    if (!window.confirm('ลบ Backup นี้ออกจากระบบและ Storage? การกระทำนี้ย้อนกลับไม่ได้')) return;
    const data = await run('delete', { snapshotId: row.id });
    if (!data) return;
    setMessage('ลบ Backup แล้ว');
    await load();
  }

  function downloadBackup(row: BackupRow) {
    if (!w.activePropertyId) return;
    window.location.href = `/api/backups?propertyId=${encodeURIComponent(w.activePropertyId)}&snapshotId=${encodeURIComponent(row.id)}&download=1`;
  }

  return <AppShell>
    <PageTitle
      title="Backup / Restore"
      subtitle="สร้าง Application Snapshot จากหน้าเว็บ กู้ข้อมูลโครงการ และดาวน์โหลดสำเนาเก็บไว้นอกระบบ"
      action={canManage ? <button className="primary-btn" onClick={createBackup} disabled={Boolean(busy)}><Icon name="refresh" size={17}/>{busy === 'create' ? ' กำลัง Backup...' : ' สร้าง Backup ตอนนี้'}</button> : undefined}
    />

    {message && <div className="connection-alert"><span>{message}</span></div>}

    <div className="stats-grid backup-stats">
      <StatCard icon="refresh" label="Backup พร้อมใช้" value={String(stats.ready)} note="ภายในโครงการปัจจุบัน"/>
      <StatCard icon="contract" label="Backup ที่รวมไฟล์" value={String(stats.withFiles)} note="เอกสารและรูปมิเตอร์ที่พบ" tone="blue"/>
      <StatCard icon="clock" label="Backup ล่าสุด" value={stats.latest ? new Date(stats.latest.created_at).toLocaleDateString('th-TH') : '-'} note={stats.latest ? new Date(stats.latest.created_at).toLocaleTimeString('th-TH', {hour:'2-digit',minute:'2-digit'}) : 'ยังไม่มี Backup'} tone="amber"/>
    </div>

    <section className="panel backup-create-panel">
      <div className="panel-head">
        <div><h2>สร้าง Backup</h2><p>สำรองข้อมูลธุรกิจของโครงการ โดยไม่แตะ Auth, User/Role, Secret และ Audit Log</p></div>
      </div>
      <div className="backup-create-grid">
        <label className="backup-file-toggle">
          <input type="checkbox" checked={includeFiles} onChange={event => setIncludeFiles(event.target.checked)}/>
          <span><b>รวมไฟล์หลักฐาน</b><small>สำรองเอกสารใน dormplus-documents และรูปมิเตอร์ใน meter-photos</small></span>
        </label>
        <label className="backup-note">หมายเหตุ Backup<input value={note} onChange={event => setNote(event.target.value)} placeholder="เช่น ก่อนปิดรอบบิลเดือนกันยายน" maxLength={500}/></label>
      </div>
      <div className="backup-scope-note">
        <Icon name="shield" size={18}/><div><b>ขอบเขต Restore ที่ปลอดภัย</b><span>Restore จะคืนห้อง ผู้เช่า สัญญา มิเตอร์ บิล การชำระ เอกสาร งานซ่อม และข้อมูลปฏิบัติการ แต่จะไม่ย้อน User/Role, รหัสผ่าน, Integration Secret, Notification history และ Audit Log เพื่อป้องกันการล็อกตัวเองออกจากระบบ</span></div>
      </div>
    </section>

    <section className="panel table-panel backup-list-panel">
      <div className="panel-head"><div><h2>ประวัติ Backup</h2><p>Restore และลบ Backup จำกัดเฉพาะ Owner</p></div><button className="secondary-btn" onClick={load} disabled={Boolean(busy)}>รีเฟรช</button></div>
      <div className="table-wrap"><table><thead><tr><th>วันที่</th><th>สถานะ</th><th>ข้อมูล</th><th>ไฟล์</th><th>ขนาด Snapshot</th><th>หมายเหตุ</th><th>Restore ล่าสุด</th><th></th></tr></thead><tbody>
        {!rows.length && <tr><td colSpan={8}><div className="backup-empty">ยังไม่มี Backup สำหรับโครงการนี้</div></td></tr>}
        {rows.map(row => <tr key={row.id}>
          <td><b>{new Date(row.created_at).toLocaleDateString('th-TH')}</b><small className="table-subtext">{new Date(row.created_at).toLocaleTimeString('th-TH')}</small></td>
          <td>{statusBadge(row.status)}{row.error_message && <small className="backup-error-text">{row.error_message}</small>}</td>
          <td><b>{totalRows(row.table_counts).toLocaleString('th-TH')} rows</b><small className="table-subtext">{Object.keys(row.table_counts || {}).length} ตาราง</small></td>
          <td>{row.include_files ? <><b>{row.file_count} ไฟล์</b><small className="table-subtext">รวมไฟล์หลักฐาน</small></> : <span className="muted-action">ข้อมูลอย่างเดียว</span>}</td>
          <td>{formatBytes(row.data_bytes)}</td>
          <td>{row.note || <span className="muted-action">-</span>}</td>
          <td>{row.restored_at ? new Date(row.restored_at).toLocaleString('th-TH') : '-'}</td>
          <td><div className="backup-actions">
            {row.status === 'ready' && <button className="secondary-btn" onClick={() => downloadBackup(row)}>ดาวน์โหลด</button>}
            {isOwner && row.status === 'ready' && <button className="secondary-btn restore-btn" onClick={() => restoreBackup(row)} disabled={Boolean(busy)}>Restore</button>}
            {isOwner && row.status !== 'restoring' && <button className="secondary-btn danger-mini" onClick={() => deleteBackup(row)} disabled={Boolean(busy)}>ลบ</button>}
          </div></td>
        </tr>)}
      </tbody></table></div>
    </section>

    <section className="panel backup-warning-panel">
      <Icon name="shield" size={21}/>
      <div><b>Application Backup ไม่ใช่ Supabase PITR</b><p>เมนูนี้ทำให้สำรอง/กู้ข้อมูล DormPlus ได้โดยไม่ต้องเข้า Supabase เหมาะกับการ Backup ก่อนแก้ข้อมูลหรือปิดรอบบิล แต่สำหรับเหตุระบบฐานข้อมูลทั้งโครงการเสียหาย ควรมี Platform Backup/PITR และสำเนานอกระบบเพิ่มเติมด้วย</p></div>
    </section>
  </AppShell>;
}
