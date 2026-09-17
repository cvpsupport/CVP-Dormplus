'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export type WorkspaceProperty = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  status: string;
  project_type: string;
  phone?: string | null;
  description?: string | null;
  billing_day?: number;
  due_day?: number;
  electricity_rate?: number;
  water_rate?: number;
  water_minimum_charge?: number;
  water_service_fee?: number;
  meter_high_usage_water?: number;
  meter_high_usage_electricity?: number;
};

const STORAGE_KEY = 'dormplus.activePropertyId';
const EVENT_NAME = 'dormplus:property-changed';

export function getStoredPropertyId() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStoredPropertyId(id: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: id }));
}

export function useWorkspace(options: { requireAuth?: boolean } = {}) {
  const { requireAuth = true } = options;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [userName, setUserName] = useState('ผู้ใช้งาน');
  const [properties, setProperties] = useState<WorkspaceProperty[]>([]);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roleName, setRoleName] = useState('ผู้ใช้งานระบบ');
  const [roleKey, setRoleKey] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccess = useCallback(async (propertyId: string | null) => {
    if (!supabase || !propertyId) {
      setPermissions([]);
      setRoleName('ผู้ใช้งานระบบ');
      setRoleKey('');
      setIsOwner(false);
      return;
    }
    setAccessLoading(true);
    const [{ data: permData, error: permError }, { data: roleData, error: roleError }] = await Promise.all([
      supabase.rpc('get_my_property_permissions', { p_property_id: propertyId }),
      supabase.rpc('get_my_property_role', { p_property_id: propertyId }),
    ]);
    if (permError || roleError) {
      // Backward-compatible fallback before migration 010 is applied.
      const { data: member } = await supabase
        .from('property_members')
        .select('role')
        .eq('property_id', propertyId)
        .maybeSingle();
      const legacyRole = String(member?.role || '');
      setRoleKey(legacyRole);
      setRoleName(legacyRole ? legacyRole.charAt(0).toUpperCase() + legacyRole.slice(1) : 'ผู้ใช้งานระบบ');
      setIsOwner(legacyRole === 'owner');
      setPermissions(legacyRole === 'owner' ? ['*'] : []);
      setAccessLoading(false);
      return;
    }
    const list = (permData || []).map((row: { permission_key: string }) => row.permission_key);
    const role = Array.isArray(roleData) ? roleData[0] : null;
    setPermissions(list);
    setRoleName(role?.role_name || 'ผู้ใช้งานระบบ');
    setRoleKey(role?.role_key || '');
    setIsOwner(Boolean(role?.is_owner));
    setAccessLoading(false);
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError('ยังไม่ได้ตั้งค่า Supabase Environment Variables');
      setLoading(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLoading(false);
      if (requireAuth) router.replace('/login');
      return;
    }

    const fullName = String(user.user_metadata?.full_name || '').trim();
    setUserName(fullName || user.email || 'ผู้ใช้งาน');

    const { data, error: queryError } = await supabase
      .from('properties')
      .select('id,name,code,address,status,project_type,phone,description,billing_day,due_day,electricity_rate,water_rate,water_minimum_charge,water_service_fee,meter_high_usage_water,meter_high_usage_electricity')
      .order('created_at', { ascending: true });

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    const list = (data || []) as WorkspaceProperty[];
    setProperties(list);
    const stored = getStoredPropertyId();
    const selected = (stored && list.some(p => p.id === stored)) ? stored : (list[0]?.id || null);
    if (selected) window.localStorage.setItem(STORAGE_KEY, selected);
    setActivePropertyId(selected);
    await loadAccess(selected);
    setError(null);
    setLoading(false);
  }, [requireAuth, router, supabase, loadAccess]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (custom.detail) {
        setActivePropertyId(custom.detail);
        void loadAccess(custom.detail);
      }
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [loadAccess]);

  const setActive = useCallback((id: string) => {
    setStoredPropertyId(id);
    setActivePropertyId(id);
    void loadAccess(id);
  }, [loadAccess]);

  const can = useCallback((permission: string) => {
    return isOwner || permissions.includes('*') || permissions.includes(permission);
  }, [isOwner, permissions]);

  return {
    supabase,
    loading,
    accessLoading,
    error,
    userName,
    properties,
    activePropertyId,
    activeProperty: properties.find(p => p.id === activePropertyId) || null,
    setActivePropertyId: setActive,
    refresh,
    permissions,
    roleName,
    roleKey,
    isOwner,
    can,
    loadAccess,
  };
}
