import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
type Row = Record<string, unknown>;

type SnapshotFile = {
  bucket: string;
  path: string;
  backupPath: string;
  bytes: number;
  error?: string;
};

export type DormPlusSnapshot = {
  format: 'dormplus-application-backup';
  version: 1;
  propertyId: string;
  createdAt: string;
  includeFiles: boolean;
  property: Row;
  tables: Record<string, Row[]>;
  files: SnapshotFile[];
};

const DIRECT_TABLES = [
  'buildings',
  'rooms',
  'tenants',
  'contracts',
  'billing_periods',
  'invoices',
  'payments',
  'receipts',
  'deposit_ledger',
  'checkout_cases',
  'expenses',
  'maintenance_tickets',
  'documents',
  'project_tasks',
  'project_documents',
  'meters',
  'meter_readings',
  'legacy_billing_snapshots',
  'legacy_tenant_history',
  'legacy_import_issues',
  'discord_meter_channels',
  'discord_meter_submissions',
  'notification_rules',
] as const;

const RESTORE_INSERT_ORDER = [
  'buildings',
  'rooms',
  'tenants',
  'contracts',
  'billing_periods',
  'invoices',
  'invoice_items',
  'payments',
  'payment_allocations',
  'receipts',
  'deposit_ledger',
  'checkout_cases',
  'expenses',
  'maintenance_tickets',
  'meters',
  'meter_readings',
  'documents',
  'project_tasks',
  'project_documents',
  'legacy_billing_snapshots',
  'legacy_tenant_history',
  'legacy_import_issues',
  'discord_meter_channels',
  'discord_meter_submissions',
  'notification_rules',
] as const;

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

async function selectPropertyRows(admin: AdminClient, table: string, propertyId: string) {
  const { data, error } = await admin.from(table).select('*').eq('property_id', propertyId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return asRows(data);
}

async function selectChildren(admin: AdminClient, table: string, foreignKey: string, ids: string[]) {
  if (!ids.length) return [];
  const output: Row[] = [];
  for (let index = 0; index < ids.length; index += 150) {
    const part = ids.slice(index, index + 150);
    const { data, error } = await admin.from(table).select('*').in(foreignKey, part);
    if (error) throw new Error(`${table}: ${error.message}`);
    output.push(...asRows(data));
  }
  return output;
}

function ids(rows: Row[]) {
  return rows.map(row => String(row.id || '')).filter(Boolean);
}

function uniqueFileRefs(tables: Record<string, Row[]>) {
  const seen = new Set<string>();
  const refs: { bucket: string; path: string }[] = [];
  const add = (bucket: string, value: unknown) => {
    const path = typeof value === 'string' ? value.trim() : '';
    if (!path) return;
    const key = `${bucket}:${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ bucket, path });
  };
  for (const row of tables.documents || []) add('dormplus-documents', row.storage_path);
  for (const row of tables.project_documents || []) add('dormplus-documents', row.storage_path);
  for (const row of tables.meter_readings || []) add('meter-photos', row.image_path);
  for (const row of tables.discord_meter_submissions || []) add('meter-photos', row.image_path);
  return refs;
}

export async function buildSnapshot(admin: AdminClient, propertyId: string, includeFiles: boolean, backupId: string): Promise<DormPlusSnapshot> {
  const { data: property, error: propertyError } = await admin.from('properties').select('*').eq('id', propertyId).single();
  if (propertyError || !property) throw new Error(propertyError?.message || 'ไม่พบโครงการ');

  const tables: Record<string, Row[]> = {};
  for (const table of DIRECT_TABLES) tables[table] = await selectPropertyRows(admin, table, propertyId);
  tables.invoice_items = await selectChildren(admin, 'invoice_items', 'invoice_id', ids(tables.invoices));
  tables.payment_allocations = await selectChildren(admin, 'payment_allocations', 'payment_id', ids(tables.payments));

  const snapshot: DormPlusSnapshot = {
    format: 'dormplus-application-backup',
    version: 1,
    propertyId,
    createdAt: new Date().toISOString(),
    includeFiles,
    property: property as Row,
    tables,
    files: [],
  };

  if (includeFiles) {
    for (const ref of uniqueFileRefs(tables)) {
      const backupPath = `${propertyId}/${backupId}/files/${ref.bucket}/${ref.path}`;
      try {
        const downloaded = await admin.storage.from(ref.bucket).download(ref.path);
        if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message || 'download failed');
        const blob = downloaded.data;
        const uploaded = await admin.storage.from('dormplus-backups').upload(backupPath, blob, { upsert: true, contentType: blob.type || undefined });
        if (uploaded.error) throw new Error(uploaded.error.message);
        snapshot.files.push({ bucket: ref.bucket, path: ref.path, backupPath, bytes: blob.size });
      } catch (error) {
        snapshot.files.push({
          bucket: ref.bucket,
          path: ref.path,
          backupPath,
          bytes: 0,
          error: error instanceof Error ? error.message : 'file backup failed',
        });
      }
    }
  }

  return snapshot;
}

export function snapshotCounts(snapshot: DormPlusSnapshot) {
  return Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length]));
}

export async function storeSnapshot(admin: AdminClient, snapshot: DormPlusSnapshot, backupId: string) {
  const path = `${snapshot.propertyId}/${backupId}/snapshot.json`;
  const body = JSON.stringify(snapshot);
  const upload = await admin.storage.from('dormplus-backups').upload(path, new Blob([body], { type: 'application/json' }), {
    upsert: true,
    contentType: 'application/json',
  });
  if (upload.error) throw new Error(upload.error.message);
  return { path, bytes: new TextEncoder().encode(body).byteLength };
}

export async function loadSnapshot(admin: AdminClient, storagePath: string) {
  const { data, error } = await admin.storage.from('dormplus-backups').download(storagePath);
  if (error || !data) throw new Error(error?.message || 'ไม่พบไฟล์ backup');
  const snapshot = JSON.parse(await data.text()) as DormPlusSnapshot;
  if (snapshot.format !== 'dormplus-application-backup' || snapshot.version !== 1) throw new Error('รูปแบบไฟล์ backup ไม่รองรับ');
  return snapshot;
}

async function deleteEq(admin: AdminClient, table: string, propertyId: string) {
  const { error } = await admin.from(table).delete().eq('property_id', propertyId);
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function clearOperationalData(admin: AdminClient, propertyId: string) {
  const [invoiceRes, paymentRes] = await Promise.all([
    admin.from('invoices').select('id').eq('property_id', propertyId),
    admin.from('payments').select('id').eq('property_id', propertyId),
  ]);
  if (invoiceRes.error) throw new Error(invoiceRes.error.message);
  if (paymentRes.error) throw new Error(paymentRes.error.message);
  const invoiceIds = ids(asRows(invoiceRes.data));
  const paymentIds = ids(asRows(paymentRes.data));

  // Child and transactional records first. Access control, users, secrets, notifications
  // and audit logs are deliberately kept outside restore to avoid lockout or secret rollback.
  for (const table of [
    'receipts','deposit_ledger','checkout_cases','documents','expenses','maintenance_tickets',
    'discord_meter_submissions','meter_readings','legacy_billing_snapshots','legacy_tenant_history','legacy_import_issues',
  ]) await deleteEq(admin, table, propertyId);

  if (paymentIds.length) {
    const result = await admin.from('payment_allocations').delete().in('payment_id', paymentIds);
    if (result.error) throw new Error(`payment_allocations: ${result.error.message}`);
  }
  if (invoiceIds.length) {
    const result = await admin.from('invoice_items').delete().in('invoice_id', invoiceIds);
    if (result.error) throw new Error(`invoice_items: ${result.error.message}`);
  }

  for (const table of [
    'payments','invoices','billing_periods','contracts','meters','tenants','rooms',
    'project_tasks','project_documents','discord_meter_channels','notification_rules','buildings',
  ]) await deleteEq(admin, table, propertyId);
}

async function insertRows(admin: AdminClient, table: string, rows: Row[]) {
  if (!rows.length) return;
  for (let index = 0; index < rows.length; index += 150) {
    const chunk = rows.slice(index, index + 150);
    const { error } = await admin.from(table).insert(chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function restoreSnapshot(admin: AdminClient, snapshot: DormPlusSnapshot) {
  const propertyId = snapshot.propertyId;
  const source = { ...snapshot.property };
  delete source.id;
  // Membership/access and creator identity are intentionally left as current-state security configuration.
  delete source.created_by;
  delete source.created_at;
  const propertyUpdate = await admin.from('properties').update(source).eq('id', propertyId);
  if (propertyUpdate.error) throw new Error(`properties: ${propertyUpdate.error.message}`);

  await clearOperationalData(admin, propertyId);
  for (const table of RESTORE_INSERT_ORDER) await insertRows(admin, table, snapshot.tables[table] || []);

  for (const file of snapshot.files || []) {
    if (file.error) continue;
    const sourceFile = await admin.storage.from('dormplus-backups').download(file.backupPath);
    if (sourceFile.error || !sourceFile.data) throw new Error(`restore file ${file.path}: ${sourceFile.error?.message || 'download failed'}`);
    const result = await admin.storage.from(file.bucket).upload(file.path, sourceFile.data, { upsert: true, contentType: sourceFile.data.type || undefined });
    if (result.error) throw new Error(`restore file ${file.path}: ${result.error.message}`);
  }
}

export async function deleteStoredSnapshot(admin: AdminClient, snapshot: DormPlusSnapshot, storagePath: string) {
  const paths = [storagePath, ...(snapshot.files || []).map(file => file.backupPath)];
  for (let index = 0; index < paths.length; index += 100) {
    const part = paths.slice(index, index + 100);
    const result = await admin.storage.from('dormplus-backups').remove(part);
    if (result.error) throw new Error(result.error.message);
  }
}
