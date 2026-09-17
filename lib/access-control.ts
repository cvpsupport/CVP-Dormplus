import { createClient as createUserClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type PropertyAccess = {
  userId: string;
  roleId: string | null;
  roleKey: string;
  roleName: string;
  legacyRole: string;
  isOwner: boolean;
  permissions: string[];
};

export async function loadPropertyAccess(admin: AdminClient, userId: string, propertyId: string): Promise<PropertyAccess | null> {
  const { data: member, error: memberError } = await admin
    .from('property_members')
    .select('role,role_id')
    .eq('property_id', propertyId)
    .eq('user_id', userId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) return null;

  let roleKey = String(member.role || 'staff');
  let roleName = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
  if (member.role_id) {
    const { data: role } = await admin
      .from('property_roles')
      .select('id,role_key,name')
      .eq('id', member.role_id)
      .eq('property_id', propertyId)
      .maybeSingle();
    if (role) {
      roleKey = role.role_key;
      roleName = role.name;
    }
  }

  const isOwner = member.role === 'owner' || roleKey === 'owner';
  let permissions: string[] = [];
  if (isOwner) {
    const { data } = await admin.from('permission_catalog').select('permission_key').order('sort_order');
    permissions = (data || []).map(row => row.permission_key);
  } else if (member.role_id) {
    const { data } = await admin
      .from('property_role_permissions')
      .select('permission_key')
      .eq('role_id', member.role_id)
      .eq('allowed', true);
    permissions = (data || []).map(row => row.permission_key);
  }

  return {
    userId,
    roleId: member.role_id || null,
    roleKey,
    roleName,
    legacyRole: String(member.role || 'staff'),
    isOwner,
    permissions,
  };
}

export async function requirePropertyAccess(propertyId: string, permission?: string) {
  const userClient = await createUserClient();
  const admin = createAdminClient();
  if (!userClient || !admin) return { error: 'Supabase server credentials are not configured', status: 500 } as const;

  const { data: authData } = await userClient.auth.getUser();
  const user = authData.user;
  if (!user) return { error: 'Unauthorized', status: 401 } as const;

  try {
    const access = await loadPropertyAccess(admin, user.id, propertyId);
    if (!access) return { error: 'ไม่มีสิทธิ์เข้าถึงโครงการนี้', status: 403 } as const;
    if (permission && !access.isOwner && !access.permissions.includes(permission)) {
      return { error: 'คุณไม่มีสิทธิ์สำหรับการทำรายการนี้', status: 403 } as const;
    }
    return { user, admin, access } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Access check failed';
    return { error: message, status: 500 } as const;
  }
}

export function hasAccess(access: PropertyAccess, permission: string) {
  return access.isOwner || access.permissions.includes(permission);
}
