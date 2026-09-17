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
  const [userName, setUserName] = useState('ผู้ใช้งาน');
  const [properties, setProperties] = useState<WorkspaceProperty[]>([]);
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setLoading(false);
  }, [requireAuth, router, supabase]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (custom.detail) setActivePropertyId(custom.detail);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const setActive = useCallback((id: string) => {
    setStoredPropertyId(id);
    setActivePropertyId(id);
  }, []);

  return {
    supabase,
    loading,
    error,
    userName,
    properties,
    activePropertyId,
    activeProperty: properties.find(p => p.id === activePropertyId) || null,
    setActivePropertyId: setActive,
    refresh,
  };
}
