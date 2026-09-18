import { NextRequest, NextResponse } from 'next/server';
import { hasAccess, requirePropertyAccess } from '@/lib/access-control';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const LEGACY_ROLES = new Set(['owner','manager','accountant','staff','technician']);

async function findAuthUserByEmail(admin: AdminClient, email: string) {
  const needle = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(user => String(user.email || '').toLowerCase() === needle);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

async function getRole(admin: AdminClient, propertyId: string, roleId: string) {
  const { data, error } = await admin
    .from('property_roles')
    .select('id,property_id,role_key,name,is_system')
    .eq('id', roleId)
    .eq('property_id', propertyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function legacyRoleForKey(key: string) {
  return LEGACY_ROLES.has(key) ? key : 'staff';
}

function normalizePermissions(input: string[]) {
  const set = new Set(input);
  const viewDependencies: Record<string, string> = {
    'projects.manage':'projects.view',
    'rooms.create':'rooms.view','rooms.update':'rooms.view','rooms.delete':'rooms.view',
    'tenants.create':'tenants.view','tenants.update':'tenants.view','tenants.delete':'tenants.view',
    'billing.create':'billing.view','billing.update':'billing.view','billing.delete':'billing.view','billing.verify':'billing.view',
    'maintenance.create':'maintenance.view','maintenance.update':'maintenance.view','maintenance.delete':'maintenance.view','maintenance.assign':'maintenance.view',
    'meters.record':'meters.view','meters.approve':'meters.view',
    'notifications.manage':'notifications.view',
    'users.manage':'users.view',
    'roles.manage':'roles.view',
    'settings.manage':'settings.view',
    'backup.manage':'backup.view',
  };
  for (const [key, view] of Object.entries(viewDependencies)) if (set.has(key)) set.add(view);
  return Array.from(set);
}

async function ensureRoleAssignable(admin: AdminClient, propertyId: string, roleId: string, callerPermissions: string[], callerIsOwner: boolean) {
  const role = await getRole(admin, propertyId, roleId);
  if (!role) throw new Error('ไม่พบ Role ที่เลือก');
  if (role.role_key === 'owner' && !callerIsOwner) throw new Error('เฉพาะ Owner เท่านั้นที่กำหนด Owner ได้');
  if (callerIsOwner) return role;
  const { data, error } = await admin.from('property_role_permissions').select('permission_key').eq('role_id', roleId).eq('allowed', true);
  if (error) throw error;
  const caller = new Set(callerPermissions);
  const elevated = (data || []).map(row => row.permission_key).filter(key => !caller.has(key));
  if (elevated.length) throw new Error('ไม่สามารถกำหนด Role ที่มีสิทธิ์สูงกว่าบัญชีของคุณได้');
  return role;
}

async function ensureNotLastOwner(
  admin: AdminClient,
  propertyId: string,
  userId: string,
) {
  const { data: target } = await admin
    .from('property_members')
    .select('role')
    .eq('property_id', propertyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (target?.role !== 'owner') return;
  const { count } = await admin
    .from('property_members')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('role', 'owner');
  if ((count || 0) <= 1) throw new Error('ไม่สามารถนำ Owner คนสุดท้ายออกหรือเปลี่ยน Role ได้');
}

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get('propertyId') || '';
  if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });

  const auth = await requirePropertyAccess(propertyId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasAccess(auth.access, 'users.view') && !hasAccess(auth.access, 'roles.view')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูผู้ใช้งานและ Role' }, { status: 403 });
  }

  const [membersRes, rolesRes, permsRes] = await Promise.all([
    auth.admin.from('property_members').select('id,user_id,role,role_id,created_at').eq('property_id', propertyId).order('created_at'),
    auth.admin.from('property_roles').select('id,role_key,name,description,is_system,created_at,updated_at').eq('property_id', propertyId).order('is_system', { ascending: false }).order('created_at'),
    auth.admin.from('permission_catalog').select('permission_key,module_key,module_label,permission_label,description,sort_order').order('sort_order'),
  ]);
  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
  if (rolesRes.error) return NextResponse.json({ error: rolesRes.error.message }, { status: 500 });
  if (permsRes.error) return NextResponse.json({ error: permsRes.error.message }, { status: 500 });

  const members = membersRes.data || [];
  const roles = rolesRes.data || [];
  const userIds = members.map(row => row.user_id);
  const roleIds = roles.map(row => row.id);

  const [profilesRes, rolePermsRes] = await Promise.all([
    userIds.length
      ? auth.admin.from('profiles').select('id,full_name,email,phone,avatar_url').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    roleIds.length
      ? auth.admin.from('property_role_permissions').select('role_id,permission_key,allowed').in('role_id', roleIds).eq('allowed', true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesRes.error) return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  if (rolePermsRes.error) return NextResponse.json({ error: rolePermsRes.error.message }, { status: 500 });

  type ProfileRow = { id:string; full_name:string; email:string|null; phone:string|null; avatar_url:string|null };
  type RoleDbRow = { id:string; role_key:string; name:string; description:string|null; is_system:boolean; created_at:string; updated_at:string };
  const profileMap = new Map<string, ProfileRow>(((profilesRes.data || []) as ProfileRow[]).map(row => [row.id, row]));
  const roleMap = new Map<string, RoleDbRow>((roles as RoleDbRow[]).map(row => [row.id, row]));
  const permissionMap = new Map<string, string[]>();
  for (const row of rolePermsRes.data || []) {
    const list = permissionMap.get(row.role_id) || [];
    list.push(row.permission_key);
    permissionMap.set(row.role_id, list);
  }
  const counts = new Map<string, number>();
  for (const member of members) if (member.role_id) counts.set(member.role_id, (counts.get(member.role_id) || 0) + 1);

  return NextResponse.json({
    currentAccess: auth.access,
    users: members.map(member => {
      const profile = profileMap.get(member.user_id);
      const role = member.role_id ? roleMap.get(member.role_id) : null;
      return {
        membershipId: member.id,
        userId: member.user_id,
        fullName: profile?.full_name || '',
        email: profile?.email || '',
        phone: profile?.phone || null,
        legacyRole: member.role,
        roleId: member.role_id || null,
        roleKey: role?.role_key || member.role,
        roleName: role?.name || member.role,
        joinedAt: member.created_at,
        isCurrentUser: member.user_id === auth.user.id,
      };
    }),
    roles: roles.map(role => ({
      ...role,
      permissions: permissionMap.get(role.id) || [],
      memberCount: counts.get(role.id) || 0,
      locked: role.role_key === 'owner',
    })),
    permissionCatalog: permsRes.data || [],
    canManageUsers: hasAccess(auth.access, 'users.manage'),
    canManageRoles: hasAccess(auth.access, 'roles.manage'),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const propertyId = String(body.propertyId || '');
  const action = String(body.action || '');
  if (!propertyId || !action) return NextResponse.json({ error: 'ข้อมูลคำสั่งไม่ครบ' }, { status: 400 });

  const auth = await requirePropertyAccess(propertyId);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    if (['create_user','update_user','remove_user'].includes(action)) {
      if (!hasAccess(auth.access, 'users.manage')) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการผู้ใช้งาน' }, { status: 403 });
    }
    if (['create_role','update_role','delete_role'].includes(action)) {
      if (!hasAccess(auth.access, 'roles.manage')) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการ Role และสิทธิ์' }, { status: 403 });
    }

    if (action === 'create_user') {
      const email = String(body.email || '').trim().toLowerCase();
      const fullName = String(body.fullName || '').trim();
      const password = String(body.password || '');
      const roleId = String(body.roleId || '');
      if (!email || !email.includes('@') || !fullName || !roleId) return NextResponse.json({ error: 'กรอกชื่อ อีเมล และ Role ให้ครบ' }, { status: 400 });
      const role = await ensureRoleAssignable(auth.admin, propertyId, roleId, auth.access.permissions, auth.access.isOwner);

      let user = await findAuthUserByEmail(auth.admin, email);
      let createdNew = false;
      if (!user) {
        if (password.length < 6) return NextResponse.json({ error: 'ผู้ใช้ใหม่ต้องมีรหัสผ่านอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
        const { data, error } = await auth.admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        user = data.user;
        createdNew = true;
      }
      if (!user) return NextResponse.json({ error: 'สร้างผู้ใช้งานไม่สำเร็จ' }, { status: 500 });

      const { error: profileError } = await auth.admin.from('profiles').upsert({
        id: user.id,
        full_name: fullName,
        email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (profileError) {
        if (createdNew) await auth.admin.auth.admin.deleteUser(user.id).catch(() => undefined);
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }

      const { data: existingMembership } = await auth.admin.from('property_members').select('role').eq('property_id', propertyId).eq('user_id', user.id).maybeSingle();
      if (existingMembership?.role === 'owner' && !auth.access.isOwner && role.role_key !== 'owner') {
        return NextResponse.json({ error: 'เฉพาะ Owner เท่านั้นที่เปลี่ยน Role ของ Owner ได้' }, { status: 403 });
      }

      const { error: memberError } = await auth.admin.from('property_members').upsert({
        property_id: propertyId,
        user_id: user.id,
        role_id: role.id,
        role: legacyRoleForKey(role.role_key),
      }, { onConflict: 'property_id,user_id' });
      if (memberError) {
        if (createdNew) await auth.admin.auth.admin.deleteUser(user.id).catch(() => undefined);
        return NextResponse.json({ error: memberError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, userId: user.id, createdNew });
    }

    if (action === 'update_user') {
      const userId = String(body.userId || '');
      const roleId = String(body.roleId || '');
      const fullName = String(body.fullName || '').trim();
      if (!userId || !roleId || !fullName) return NextResponse.json({ error: 'ข้อมูลผู้ใช้ไม่ครบ' }, { status: 400 });
      const role = await ensureRoleAssignable(auth.admin, propertyId, roleId, auth.access.permissions, auth.access.isOwner);

      const { data: current } = await auth.admin.from('property_members').select('role').eq('property_id', propertyId).eq('user_id', userId).maybeSingle();
      if (current?.role === 'owner' && !auth.access.isOwner && role.role_key !== 'owner') return NextResponse.json({ error: 'เฉพาะ Owner เท่านั้นที่เปลี่ยน Role ของ Owner ได้' }, { status: 403 });
      if (current?.role === 'owner' && role.role_key !== 'owner') await ensureNotLastOwner(auth.admin, propertyId, userId);

      const [{ error: memberError }, { error: profileError }] = await Promise.all([
        auth.admin.from('property_members').update({ role_id: role.id, role: legacyRoleForKey(role.role_key) }).eq('property_id', propertyId).eq('user_id', userId),
        auth.admin.from('profiles').update({ full_name: fullName, updated_at: new Date().toISOString() }).eq('id', userId),
      ]);
      if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
      if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
      await auth.admin.auth.admin.updateUserById(userId, { user_metadata: { full_name: fullName } }).catch(() => undefined);
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove_user') {
      const userId = String(body.userId || '');
      if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      if (userId === auth.user.id) return NextResponse.json({ error: 'ไม่สามารถนำบัญชีที่กำลังใช้งานออกจากโครงการได้' }, { status: 400 });
      const { data: targetMember } = await auth.admin.from('property_members').select('role').eq('property_id', propertyId).eq('user_id', userId).maybeSingle();
      if (targetMember?.role === 'owner' && !auth.access.isOwner) return NextResponse.json({ error: 'เฉพาะ Owner เท่านั้นที่นำ Owner ออกจากโครงการได้' }, { status: 403 });
      await ensureNotLastOwner(auth.admin, propertyId, userId);
      const { error } = await auth.admin.from('property_members').delete().eq('property_id', propertyId).eq('user_id', userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_role') {
      const name = String(body.name || '').trim();
      const description = String(body.description || '').trim();
      const permissions = normalizePermissions(Array.isArray(body.permissions) ? body.permissions.map(String) : []);
      if (!name) return NextResponse.json({ error: 'กรอกชื่อ Role' }, { status: 400 });
      const roleKey = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
      const { data: role, error } = await auth.admin.from('property_roles').insert({
        property_id: propertyId,
        role_key: roleKey,
        name,
        description: description || null,
        is_system: false,
      }).select('id').single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (permissions.length) {
        const { error: permError } = await auth.admin.from('property_role_permissions').insert(permissions.map(permissionKey => ({ role_id: role.id, permission_key: permissionKey, allowed: true })));
        if (permError) return NextResponse.json({ error: permError.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, roleId: role.id });
    }

    if (action === 'update_role') {
      const roleId = String(body.roleId || '');
      const name = String(body.name || '').trim();
      const description = String(body.description || '').trim();
      const permissions = normalizePermissions(Array.isArray(body.permissions) ? body.permissions.map(String) : []);
      const role = await getRole(auth.admin, propertyId, roleId);
      if (!role) return NextResponse.json({ error: 'ไม่พบ Role' }, { status: 404 });
      if (role.role_key === 'owner') return NextResponse.json({ error: 'Owner เป็น Role หลักและแก้ไขสิทธิ์ไม่ได้' }, { status: 400 });
      if (!name) return NextResponse.json({ error: 'กรอกชื่อ Role' }, { status: 400 });
      const { error: updateError } = await auth.admin.from('property_roles').update({ name, description: description || null, updated_at: new Date().toISOString() }).eq('id', roleId).eq('property_id', propertyId);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
      const { error: deleteError } = await auth.admin.from('property_role_permissions').delete().eq('role_id', roleId);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
      if (permissions.length) {
        const { error: permError } = await auth.admin.from('property_role_permissions').insert(permissions.map(permissionKey => ({ role_id: roleId, permission_key: permissionKey, allowed: true })));
        if (permError) return NextResponse.json({ error: permError.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_role') {
      const roleId = String(body.roleId || '');
      const role = await getRole(auth.admin, propertyId, roleId);
      if (!role) return NextResponse.json({ error: 'ไม่พบ Role' }, { status: 404 });
      if (role.is_system) return NextResponse.json({ error: 'Role มาตรฐานของระบบลบไม่ได้ แต่แก้ไขสิทธิ์ได้ (ยกเว้น Owner)' }, { status: 400 });
      const { count } = await auth.admin.from('property_members').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('role_id', roleId);
      if ((count || 0) > 0) return NextResponse.json({ error: `Role นี้มีผู้ใช้งาน ${count} คน กรุณาเปลี่ยน Role ของผู้ใช้ก่อน` }, { status: 409 });
      const { error } = await auth.admin.from('property_roles').delete().eq('id', roleId).eq('property_id', propertyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
