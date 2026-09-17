'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { EmptyState, FormActions, Modal, Toast } from '@/components/crud-ui';
import { Icon } from '@/components/icons';
import { PageTitle } from '@/components/ui';
import { useWorkspace } from '@/lib/workspace';

type UserRow = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  legacyRole: string;
  roleId: string | null;
  roleKey: string;
  roleName: string;
  joinedAt: string;
  isCurrentUser: boolean;
};

type RoleRow = {
  id: string;
  role_key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
  memberCount: number;
  locked: boolean;
};

type PermissionRow = {
  permission_key: string;
  module_key: string;
  module_label: string;
  permission_label: string;
  description: string | null;
  sort_order: number;
};

type AccessPayload = {
  users: UserRow[];
  roles: RoleRow[];
  permissionCatalog: PermissionRow[];
  canManageUsers: boolean;
  canManageRoles: boolean;
};

const emptyUser = { fullName: '', email: '', password: '', roleId: '' };
const emptyRole = { name: '', description: '', permissions: [] as string[] };

function initials(name: string, email: string) {
  const value = (name || email || '?').trim();
  return value.slice(0, 2).toUpperCase();
}

export default function UsersRolesPage() {
  const workspace = useWorkspace();
  const [tab, setTab] = useState<'users'|'roles'>('users');
  const [data, setData] = useState<AccessPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{message:string;tone:'success'|'error'}|null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [userForm, setUserForm] = useState(emptyUser);
  const [roleOpen, setRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRow | null>(null);
  const [roleForm, setRoleForm] = useState(emptyRole);

  const load = useCallback(async () => {
    if (!workspace.activePropertyId) { setData(null); return; }
    setLoading(true);
    const res = await fetch(`/api/access-control?propertyId=${encodeURIComponent(workspace.activePropertyId)}`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setToast({ message: json.error || 'โหลดข้อมูลสิทธิ์ไม่สำเร็จ', tone: 'error' });
    else setData(json as AccessPayload);
    setLoading(false);
  }, [workspace.activePropertyId]);

  useEffect(() => { void load(); }, [load]);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, {label:string; rows:PermissionRow[]}>();
    for (const row of data?.permissionCatalog || []) {
      const group = groups.get(row.module_key) || { label: row.module_label, rows: [] };
      group.rows.push(row);
      groups.set(row.module_key, group);
    }
    return Array.from(groups.entries());
  }, [data?.permissionCatalog]);

  function openCreateUser() {
    const firstRole = data?.roles.find(r => r.role_key !== 'owner') || data?.roles[0];
    setEditingUser(null);
    setUserForm({ ...emptyUser, roleId: firstRole?.id || '' });
    setUserOpen(true);
  }

  function openEditUser(user: UserRow) {
    setEditingUser(user);
    setUserForm({ fullName: user.fullName, email: user.email, password: '', roleId: user.roleId || '' });
    setUserOpen(true);
  }

  async function submitUser(e: FormEvent) {
    e.preventDefault();
    if (!workspace.activePropertyId) return;
    setSaving(true);
    const payload = editingUser
      ? { action:'update_user', propertyId:workspace.activePropertyId, userId:editingUser.userId, fullName:userForm.fullName, roleId:userForm.roleId }
      : { action:'create_user', propertyId:workspace.activePropertyId, fullName:userForm.fullName, email:userForm.email, password:userForm.password, roleId:userForm.roleId };
    const res = await fetch('/api/access-control', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setToast({ message:json.error || 'บันทึกผู้ใช้ไม่สำเร็จ', tone:'error' });
    else {
      setToast({ message:editingUser ? 'แก้ไขผู้ใช้งานแล้ว' : (json.createdNew ? 'สร้างบัญชีและเพิ่มผู้ใช้งานแล้ว' : 'เพิ่มบัญชีเดิมเข้าโครงการแล้ว'), tone:'success' });
      setUserOpen(false);
      await load();
    }
    setSaving(false);
  }

  async function removeUser(user: UserRow) {
    if (!workspace.activePropertyId || !window.confirm(`นำ ${user.fullName || user.email} ออกจากโครงการนี้?\n\nบัญชี Auth จะไม่ถูกลบ และยังใช้กับโครงการอื่นได้`)) return;
    const res = await fetch('/api/access-control', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'remove_user', propertyId:workspace.activePropertyId, userId:user.userId }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setToast({ message:json.error || 'ลบผู้ใช้ไม่สำเร็จ', tone:'error' });
    else { setToast({ message:'นำผู้ใช้ออกจากโครงการแล้ว', tone:'success' }); await load(); }
  }

  function openCreateRole() {
    setEditingRole(null);
    setRoleForm(emptyRole);
    setRoleOpen(true);
  }

  function openEditRole(role: RoleRow) {
    setEditingRole(role);
    setRoleForm({ name:role.name, description:role.description || '', permissions:[...role.permissions] });
    setRoleOpen(true);
  }

  function togglePermission(key: string) {
    setRoleForm(current => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter(value => value !== key)
        : [...current.permissions, key],
    }));
  }

  function toggleModule(keys: string[]) {
    const allSelected = keys.every(key => roleForm.permissions.includes(key));
    setRoleForm(current => ({
      ...current,
      permissions: allSelected
        ? current.permissions.filter(key => !keys.includes(key))
        : Array.from(new Set([...current.permissions, ...keys])),
    }));
  }

  async function submitRole(e: FormEvent) {
    e.preventDefault();
    if (!workspace.activePropertyId) return;
    setSaving(true);
    const payload = editingRole
      ? { action:'update_role', propertyId:workspace.activePropertyId, roleId:editingRole.id, ...roleForm }
      : { action:'create_role', propertyId:workspace.activePropertyId, ...roleForm };
    const res = await fetch('/api/access-control', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setToast({ message:json.error || 'บันทึก Role ไม่สำเร็จ', tone:'error' });
    else { setToast({ message:editingRole ? 'อัปเดต Role และสิทธิ์แล้ว' : 'สร้าง Role ใหม่แล้ว', tone:'success' }); setRoleOpen(false); await load(); await workspace.loadAccess(workspace.activePropertyId); }
    setSaving(false);
  }

  async function deleteRole(role: RoleRow) {
    if (!workspace.activePropertyId || !window.confirm(`ลบ Role “${role.name}”?`)) return;
    const res = await fetch('/api/access-control', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action:'delete_role', propertyId:workspace.activePropertyId, roleId:role.id }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setToast({ message:json.error || 'ลบ Role ไม่สำเร็จ', tone:'error' });
    else { setToast({ message:'ลบ Role แล้ว', tone:'success' }); await load(); }
  }

  if (!workspace.activePropertyId) return <AppShell><PageTitle title="ผู้ใช้ / Role / สิทธิ์" subtitle="จัดการการเข้าถึงแบบแยกตามโครงการ"/><EmptyState title="ยังไม่มีโครงการ" description="สร้างโครงการก่อนเพิ่มผู้ใช้งานและกำหนดสิทธิ์"/></AppShell>;

  return <AppShell>
    <PageTitle
      title="ผู้ใช้ / Role / สิทธิ์"
      subtitle={`${workspace.activeProperty?.name || ''} · กำหนดผู้ใช้งานและสิทธิ์แบบละเอียด`}
      action={tab==='users' && data?.canManageUsers
        ? <button className="primary-btn" onClick={openCreateUser}><Icon name="plus" size={17}/> เพิ่มผู้ใช้งาน</button>
        : tab==='roles' && data?.canManageRoles
          ? <button className="primary-btn" onClick={openCreateRole}><Icon name="plus" size={17}/> เพิ่ม Role</button>
          : undefined}
    />

    <div className="access-summary-grid">
      <div className="access-summary-card"><span>ผู้ใช้งานในโครงการ</span><strong>{data?.users.length || 0}</strong><small>บัญชีที่เข้าถึงโครงการนี้</small></div>
      <div className="access-summary-card"><span>Role ทั้งหมด</span><strong>{data?.roles.length || 0}</strong><small>Role มาตรฐาน + Role ที่สร้างเอง</small></div>
      <div className="access-summary-card"><span>Role ของคุณ</span><strong className="access-role-name">{workspace.roleName}</strong><small>{workspace.isOwner ? 'สิทธิ์ทั้งหมด' : `${workspace.permissions.length} สิทธิ์ที่ได้รับ`}</small></div>
    </div>

    <div className="access-tabs">
      <button className={tab==='users'?'active':''} onClick={()=>setTab('users')}><Icon name="users" size={17}/> ผู้ใช้งาน</button>
      <button className={tab==='roles'?'active':''} onClick={()=>setTab('roles')}><Icon name="shield" size={17}/> Role และ Permissions</button>
    </div>

    {loading ? <div className="panel access-loading">กำลังโหลดข้อมูลสิทธิ์...</div> : tab==='users' ? (
      <section className="panel access-panel">
        <div className="access-panel-head"><div><h3>สมาชิกโครงการ</h3><p>เพิ่มบัญชีใหม่ หรือเพิ่มบัญชีที่มีอยู่แล้วเข้าสู่โครงการ และเปลี่ยน Role ได้จากหน้านี้</p></div></div>
        {!data?.users.length ? <EmptyState title="ยังไม่มีผู้ใช้งาน" description="เพิ่มผู้ดูแลหรือพนักงานคนแรก"/> : <div className="access-user-list">
          {data.users.map(user => <div className="access-user-row" key={user.userId}>
            <div className="access-user-avatar">{initials(user.fullName,user.email)}</div>
            <div className="access-user-main"><strong>{user.fullName || 'ยังไม่ระบุชื่อ'} {user.isCurrentUser && <span className="you-chip">คุณ</span>}</strong><span>{user.email || 'ไม่มีอีเมลใน profile'}</span></div>
            <div className="access-role-chip"><Icon name="shield" size={14}/>{user.roleName}</div>
            <div className="access-user-actions">
              {data.canManageUsers && <button className="outline-btn compact" onClick={()=>openEditUser(user)}>แก้ไข</button>}
              {data.canManageUsers && !user.isCurrentUser && <button className="danger-outline-btn compact" onClick={()=>void removeUser(user)}>ลบออก</button>}
            </div>
          </div>)}
        </div>}
      </section>
    ) : (
      <div className="role-grid">
        {(data?.roles || []).map(role => <article className={`panel role-card ${role.role_key==='owner'?'owner-role':''}`} key={role.id}>
          <div className="role-card-head"><div className="role-card-icon"><Icon name="shield" size={21}/></div><div><div className="role-name-line"><h3>{role.name}</h3>{role.is_system && <span className="system-chip">System</span>}</div><p>{role.description || 'Role ที่กำหนดเอง'}</p></div></div>
          <div className="role-stats"><span><b>{role.memberCount}</b> ผู้ใช้</span><span><b>{role.permissions.length}</b> สิทธิ์</span></div>
          <div className="role-permission-preview">{role.role_key==='owner' ? <span>Owner มีสิทธิ์ทั้งหมดและล็อกไว้เพื่อป้องกันระบบ</span> : role.permissions.slice(0,5).map(key => <span key={key}>{data?.permissionCatalog.find(p=>p.permission_key===key)?.permission_label || key}</span>)}</div>
          <div className="role-card-actions">
            {data?.canManageRoles && !role.locked && <button className="outline-btn" onClick={()=>openEditRole(role)}>แก้ไขสิทธิ์</button>}
            {data?.canManageRoles && !role.is_system && <button className="danger-outline-btn" onClick={()=>void deleteRole(role)}>ลบ Role</button>}
            {role.locked && <span className="locked-role-note">Role หลักของระบบ</span>}
          </div>
        </article>)}
      </div>
    )}

    <Modal open={userOpen} title={editingUser?'แก้ไขผู้ใช้งาน':'เพิ่มผู้ใช้งาน'} subtitle={editingUser?'เปลี่ยนชื่อหรือ Role ในโครงการ':'ถ้าอีเมลมีในระบบอยู่แล้ว จะเพิ่มเข้าโครงการโดยไม่สร้างบัญชีซ้ำ'} onClose={()=>setUserOpen(false)}>
      <form className="crud-form" onSubmit={submitUser}>
        <div className="form-grid">
          <label>ชื่อผู้ใช้งาน<input required value={userForm.fullName} onChange={e=>setUserForm({...userForm,fullName:e.target.value})}/></label>
          <label>Role<select required value={userForm.roleId} onChange={e=>setUserForm({...userForm,roleId:e.target.value})}><option value="">เลือก Role</option>{(data?.roles || []).filter(role=>workspace.isOwner || role.role_key!=='owner').map(role=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
          <label className="full">อีเมล<input type="email" required={!editingUser} disabled={Boolean(editingUser)} value={userForm.email} onChange={e=>setUserForm({...userForm,email:e.target.value})}/></label>
          {!editingUser && <label className="full">รหัสผ่านชั่วคราว<input type="password" minLength={6} value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} placeholder="อย่างน้อย 6 ตัว — เว้นว่างได้เมื่ออีเมลมีบัญชีอยู่แล้ว"/><small className="field-help">หากเป็นบัญชีใหม่ ต้องกำหนดอย่างน้อย 6 ตัวอักษร</small></label>}
        </div>
        <FormActions saving={saving} onCancel={()=>setUserOpen(false)} saveLabel={editingUser?'บันทึกการแก้ไข':'เพิ่มผู้ใช้งาน'}/>
      </form>
    </Modal>

    <Modal open={roleOpen} title={editingRole?`แก้ไข Role: ${editingRole.name}`:'เพิ่ม Role ใหม่'} subtitle="เลือกสิทธิ์ที่ Role นี้สามารถใช้งานในโครงการปัจจุบัน" onClose={()=>setRoleOpen(false)}>
      <form className="crud-form role-form" onSubmit={submitRole}>
        <div className="form-grid">
          <label>ชื่อ Role<input required value={roleForm.name} onChange={e=>setRoleForm({...roleForm,name:e.target.value})} placeholder="เช่น หัวหน้าหอ, เจ้าหน้าที่มิเตอร์"/></label>
          <label className="full">คำอธิบาย<input value={roleForm.description} onChange={e=>setRoleForm({...roleForm,description:e.target.value})} placeholder="หน้าที่ของ Role นี้"/></label>
        </div>
        <div className="permission-editor">
          {groupedPermissions.map(([moduleKey, group]) => {
            const keys=group.rows.map(row=>row.permission_key);
            const all=keys.every(key=>roleForm.permissions.includes(key));
            return <section className="permission-group" key={moduleKey}>
              <div className="permission-group-head"><strong>{group.label}</strong><button type="button" className="permission-select-all" onClick={()=>toggleModule(keys)}>{all?'ยกเลิกทั้งหมด':'เลือกทั้งหมด'}</button></div>
              <div className="permission-checks">{group.rows.map(row=><label className="permission-check" key={row.permission_key}><input type="checkbox" checked={roleForm.permissions.includes(row.permission_key)} onChange={()=>togglePermission(row.permission_key)}/><span><b>{row.permission_label}</b><small>{row.description}</small></span></label>)}</div>
            </section>;
          })}
        </div>
        <FormActions saving={saving} onCancel={()=>setRoleOpen(false)} saveLabel={editingRole?'บันทึกสิทธิ์':'สร้าง Role'}/>
      </form>
    </Modal>

    <Toast message={toast?.message || null} tone={toast?.tone} onClose={()=>setToast(null)}/>
  </AppShell>;
}
