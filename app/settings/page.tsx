'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { EmptyState, Toast } from '@/components/crud-ui';
import { PageTitle } from '@/components/ui';
import { useWorkspace } from '@/lib/workspace';
import { Icon } from '@/components/icons';

const empty={name:'',phone:'',address:'',billing_day:'25',due_day:'5',electricity_rate:'8',water_rate:'20'};
export default function SettingsPage(){
  const router=useRouter();
  const workspace=useWorkspace(); const [form,setForm]=useState(empty); const [saving,setSaving]=useState(false); const [toast,setToast]=useState<{message:string;tone:'success'|'error'}|null>(null);
  useEffect(()=>{const p=workspace.activeProperty;if(p)setForm({name:p.name||'',phone:p.phone||'',address:p.address||'',billing_day:String(p.billing_day??25),due_day:String(p.due_day??5),electricity_rate:String(p.electricity_rate??8),water_rate:String(p.water_rate??20)})},[workspace.activePropertyId,workspace.activeProperty]);
  async function logout(){
    try {
      if(workspace.supabase) await workspace.supabase.auth.signOut({scope:'local'});
    } finally {
      window.localStorage.removeItem('dormplus.activePropertyId');
      router.replace('/login');
      router.refresh();
    }
  }
  async function submit(e:FormEvent){e.preventDefault();if(!workspace.supabase||!workspace.activePropertyId)return;setSaving(true);const {error}=await workspace.supabase.from('properties').update({name:form.name.trim(),phone:form.phone.trim()||null,address:form.address.trim()||null,billing_day:Number(form.billing_day),due_day:Number(form.due_day),electricity_rate:Number(form.electricity_rate),water_rate:Number(form.water_rate),updated_at:new Date().toISOString()}).eq('id',workspace.activePropertyId);if(error)setToast({message:error.message,tone:'error'});else{setToast({message:'บันทึกการตั้งค่าแล้ว',tone:'success'});await workspace.refresh()}setSaving(false)}
  return <AppShell><PageTitle title="ตั้งค่าหอพัก" subtitle="แก้ไขข้อมูลโครงการ รอบบิล และอัตราค่าน้ำ-ไฟ"/>{!workspace.activePropertyId?<EmptyState title="ยังไม่มีโครงการ" description="สร้างโครงการก่อนตั้งค่าหอพัก"/>:<form onSubmit={submit}><div className="settings-grid"><section className="panel form-panel"><h3>ข้อมูลหอพัก</h3><div className="form-grid"><label>ชื่อหอพัก<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>เบอร์โทร<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label className="full">ที่อยู่<input value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label></div></section><section className="panel form-panel"><h3>รอบบิล</h3><div className="form-grid"><label>วันที่ออกบิล<input type="number" min="1" max="28" value={form.billing_day} onChange={e=>setForm({...form,billing_day:e.target.value})}/></label><label>วันครบกำหนด<input type="number" min="1" max="28" value={form.due_day} onChange={e=>setForm({...form,due_day:e.target.value})}/></label><label>ค่าไฟ / หน่วย<input type="number" min="0" step="0.01" value={form.electricity_rate} onChange={e=>setForm({...form,electricity_rate:e.target.value})}/></label><label>ค่าน้ำ / หน่วย<input type="number" min="0" step="0.01" value={form.water_rate} onChange={e=>setForm({...form,water_rate:e.target.value})}/></label></div><button className="primary-btn" type="submit" disabled={saving}>{saving?'กำลังบันทึก...':'บันทึกการตั้งค่า'}</button></section></div></form>}<section className="panel account-panel"><div><span className="settings-kicker">บัญชีผู้ใช้งาน</span><h3>การเข้าสู่ระบบ</h3><p>ออกจากระบบบนอุปกรณ์นี้ แล้วกลับไปยังหน้า Login</p></div><button type="button" className="danger-outline-btn" onClick={logout}><Icon name="logout" size={17}/> ออกจากระบบ</button></section><Toast message={toast?.message||null} tone={toast?.tone} onClose={()=>setToast(null)}/></AppShell>
}
