'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle } from '@/components/ui';
import { Icon } from '@/components/icons';
import { CrudMenu, EmptyState, FormActions, Modal, Toast } from '@/components/crud-ui';
import { useWorkspace } from '@/lib/workspace';

type Tenant={id:string;property_id:string;full_name:string;phone:string|null;email:string|null;national_id:string|null;created_at:string};
type Room={id:string;room_number:string;monthly_rent:number;deposit_amount:number;status:string;building_id:string|null};
type Building={id:string;name:string};
type Contract={id:string;tenant_id:string;room_id:string;contract_number:string;start_date:string;end_date:string|null;rent_amount:number;deposit_amount:number;status:string};
const emptyForm={full_name:'',phone:'',email:'',national_id:'',room_id:'',start_date:new Date().toISOString().slice(0,10),end_date:'',rent_amount:'',deposit_amount:''};

export default function TenantsPage(){
  const workspace=useWorkspace();
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [rooms,setRooms]=useState<Room[]>([]);
  const [contracts,setContracts]=useState<Contract[]>([]);
  const [buildings,setBuildings]=useState<Building[]>([]);
  const [search,setSearch]=useState('');
  const [buildingFilter,setBuildingFilter]=useState('');
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState<Tenant|null>(null);
  const [form,setForm]=useState(emptyForm);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState<{message:string;tone:'success'|'error'}|null>(null);

  async function load(){
    if(!workspace.supabase||!workspace.activePropertyId){setTenants([]);return;}
    const pid=workspace.activePropertyId;
    const [t,r,c,b]=await Promise.all([
      workspace.supabase.from('tenants').select('id,property_id,full_name,phone,email,national_id,created_at').eq('property_id',pid).is('archived_at',null).order('created_at',{ascending:false}),
      workspace.supabase.from('rooms').select('id,room_number,monthly_rent,deposit_amount,status,building_id').eq('property_id',pid).is('archived_at',null).order('room_number'),
      workspace.supabase.from('contracts').select('id,tenant_id,room_id,contract_number,start_date,end_date,rent_amount,deposit_amount,status').eq('property_id',pid).order('created_at',{ascending:false}),
      workspace.supabase.from('buildings').select('id,name').eq('property_id',pid).order('name')
    ]);
    if(t.error)setToast({message:t.error.message,tone:'error'}); else setTenants((t.data||[]) as Tenant[]);
    setRooms((r.data||[]) as Room[]); setContracts((c.data||[]) as Contract[]); setBuildings((b.data||[]) as Building[]);
  }
  useEffect(()=>{setBuildingFilter('');void load();},[workspace.activePropertyId]);

  const activeContractByTenant=useMemo(()=>{const m=new Map<string,Contract>(); for(const c of contracts){if(!m.has(c.tenant_id)&&c.status==='active')m.set(c.tenant_id,c);} return m;},[contracts]);
  const roomMap=useMemo(()=>new Map(rooms.map(r=>[r.id,r])),[rooms]);

  function createNew(){setEditing(null);setForm(emptyForm);setOpen(true);}
  function editTenant(t:Tenant){const c=activeContractByTenant.get(t.id); const r=c?roomMap.get(c.room_id):undefined; setEditing(t);setForm({full_name:t.full_name,phone:t.phone||'',email:t.email||'',national_id:t.national_id||'',room_id:c?.room_id||'',start_date:c?.start_date||new Date().toISOString().slice(0,10),end_date:c?.end_date||'',rent_amount:String(c?.rent_amount??r?.monthly_rent??''),deposit_amount:String(c?.deposit_amount??r?.deposit_amount??'')});setOpen(true);}
  function chooseRoom(id:string){const r=rooms.find(x=>x.id===id);setForm({...form,room_id:id,rent_amount:r?String(r.monthly_rent):form.rent_amount,deposit_amount:r?String(r.deposit_amount):form.deposit_amount});}

  async function submit(e:FormEvent){e.preventDefault();if(!workspace.supabase||!workspace.activePropertyId)return;setSaving(true);const pid=workspace.activePropertyId;
    if(editing){
      const {error}=await workspace.supabase.from('tenants').update({full_name:form.full_name.trim(),phone:form.phone.trim()||null,email:form.email.trim()||null,national_id:form.national_id.trim()||null,updated_at:new Date().toISOString()}).eq('id',editing.id);
      if(error){setToast({message:error.message,tone:'error'});setSaving(false);return;}
      const current=activeContractByTenant.get(editing.id);
      if(current&&form.room_id){
        await workspace.supabase.from('contracts').update({room_id:form.room_id,start_date:form.start_date,end_date:form.end_date||null,rent_amount:Number(form.rent_amount)||0,deposit_amount:Number(form.deposit_amount)||0,updated_at:new Date().toISOString()}).eq('id',current.id);
        if(current.room_id!==form.room_id){await workspace.supabase.from('rooms').update({status:'vacant'}).eq('id',current.room_id);await workspace.supabase.from('rooms').update({status:'occupied'}).eq('id',form.room_id);}
      }
      setToast({message:'แก้ไขข้อมูลผู้เช่าเรียบร้อย',tone:'success'});setOpen(false);await load();
    } else {
      const {data:t,error}=await workspace.supabase.from('tenants').insert({property_id:pid,full_name:form.full_name.trim(),phone:form.phone.trim()||null,email:form.email.trim()||null,national_id:form.national_id.trim()||null}).select('id').single();
      if(error||!t){setToast({message:error?.message||'ไม่สามารถสร้างผู้เช่าได้',tone:'error'});setSaving(false);return;}
      if(form.room_id){
        const contractNo=`CTR-${Date.now().toString().slice(-8)}`;
        const {error:contractError}=await workspace.supabase.from('contracts').insert({property_id:pid,room_id:form.room_id,tenant_id:t.id,contract_number:contractNo,start_date:form.start_date,end_date:form.end_date||null,rent_amount:Number(form.rent_amount)||0,deposit_amount:Number(form.deposit_amount)||0,billing_day:workspace.activeProperty?.billing_day||25,due_day:workspace.activeProperty?.due_day||5,status:'active'});
        if(contractError){await workspace.supabase.from('tenants').delete().eq('id',t.id);setToast({message:contractError.message,tone:'error'});setSaving(false);return;}
        await workspace.supabase.from('rooms').update({status:'occupied'}).eq('id',form.room_id);
      }
      setToast({message:'เพิ่มผู้เช่าเรียบร้อย',tone:'success'});setOpen(false);await load();
    }
    setSaving(false);
  }

  async function archiveTenant(t:Tenant){if(!workspace.supabase||!window.confirm(`นำ “${t.full_name}” ออกจากรายชื่อผู้เช่าปัจจุบัน? ประวัติสัญญาและการเงินจะยังถูกเก็บไว้`))return;const c=activeContractByTenant.get(t.id);if(c){await workspace.supabase.from('contracts').update({status:'terminated',updated_at:new Date().toISOString()}).eq('id',c.id);await workspace.supabase.from('rooms').update({status:'vacant'}).eq('id',c.room_id);}const {error}=await workspace.supabase.from('tenants').update({archived_at:new Date().toISOString()}).eq('id',t.id);if(error)setToast({message:error.message,tone:'error'});else{setToast({message:'นำผู้เช่าออกจากรายการแล้ว',tone:'success'});await load();}}

  const filtered=tenants.filter(t=>{const c=activeContractByTenant.get(t.id);const room=c?roomMap.get(c.room_id):undefined;const matchesBuilding=!buildingFilter||room?.building_id===buildingFilter;const matchesSearch=`${t.full_name} ${t.phone||''} ${t.email||''} ${room?.room_number||''}`.toLowerCase().includes(search.toLowerCase());return matchesBuilding&&matchesSearch;});
  const availableRooms=rooms.filter(r=>(r.status==='vacant'||r.id===form.room_id)&&(!buildingFilter||r.building_id===buildingFilter));
  return <AppShell>
    <PageTitle title="ผู้เช่า" subtitle={workspace.activeProperty?`จัดการผู้เช่าของ ${workspace.activeProperty.name}`:'สร้างโครงการก่อนเพิ่มผู้เช่า'} action={<button className="primary-btn" onClick={createNew} disabled={!workspace.activePropertyId}><Icon name="plus" size={18}/> เพิ่มผู้เช่า</button>}/>
    <div className="toolbar"><div className="meter-filter-group"><div className="search-box"><Icon name="search" size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาชื่อ เบอร์โทร อีเมล หรือเลขห้อง..."/></div><label className="building-filter"><Icon name="project" size={17}/><span>อาคาร</span><select value={buildingFilter} onChange={e=>setBuildingFilter(e.target.value)}><option value="">ทุกอาคาร ({rooms.length})</option>{buildings.map(b=><option key={b.id} value={b.id}>{b.name} ({rooms.filter(r=>r.building_id===b.id).length} ห้อง)</option>)}</select><Icon name="chevron-down" size={15}/></label></div></div>
    {!workspace.activePropertyId?<EmptyState title="ยังไม่มีโครงการ" description="สร้างโครงการก่อนเพิ่มผู้เช่า"/>:!filtered.length?<EmptyState title="ยังไม่มีผู้เช่า" description="เพิ่มผู้เช่าคนแรก และเลือกห้องเพื่อสร้างสัญญาอัตโนมัติ" action={<button className="primary-btn" onClick={createNew}><Icon name="plus" size={17}/> เพิ่มผู้เช่า</button>}/>:<section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>ผู้เช่า</th><th>ห้อง</th><th>เบอร์โทร</th><th>สัญญาสิ้นสุด</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{filtered.map((t,i)=>{const c=activeContractByTenant.get(t.id);const room=c?roomMap.get(c.room_id):undefined;return <tr key={t.id}><td><div className="person-cell"><div className="avatar">{t.full_name[0]||'T'}</div><div><b>{t.full_name}</b><span>{t.email||`TEN-${String(i+1).padStart(3,'0')}`}</span></div></div></td><td><b>{room?.room_number||'-'}</b></td><td>{t.phone||'-'}</td><td>{c?.end_date||'-'}</td><td><Badge tone={c?'green':'gray'}>{c?'กำลังเข้าพัก':'ไม่มีสัญญา'}</Badge></td><td><CrudMenu onEdit={()=>editTenant(t)} onDelete={()=>void archiveTenant(t)}/></td></tr>})}</tbody></table></div></section>}

    <Modal open={open} title={editing?'แก้ไขผู้เช่า':'เพิ่มผู้เช่า'} subtitle={editing?'แก้ไขข้อมูลและสัญญาปัจจุบัน':'เลือกห้องได้เพื่อสร้างสัญญาเช่าอัตโนมัติ'} onClose={()=>setOpen(false)}><form className="crud-form" onSubmit={submit}><div className="form-grid">
      <label>ชื่อ-นามสกุล<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label><label>เบอร์โทร<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>อีเมล<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>เลขบัตร/Passport<input value={form.national_id} onChange={e=>setForm({...form,national_id:e.target.value})}/></label>
      <label>ห้อง<select value={form.room_id} onChange={e=>chooseRoom(e.target.value)}><option value="">ยังไม่ผูกห้อง</option>{availableRooms.map(r=><option key={r.id} value={r.id}>ห้อง {r.room_number} · ฿{Number(r.monthly_rent).toLocaleString()}</option>)}</select></label><label>ค่าเช่า<input type="number" min="0" value={form.rent_amount} onChange={e=>setForm({...form,rent_amount:e.target.value})}/></label><label>เงินประกัน<input type="number" min="0" value={form.deposit_amount} onChange={e=>setForm({...form,deposit_amount:e.target.value})}/></label><label>เริ่มสัญญา<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label><label>สิ้นสุดสัญญา<input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></label>
    </div><FormActions saving={saving} onCancel={()=>setOpen(false)}/></form></Modal><Toast message={toast?.message||null} tone={toast?.tone} onClose={()=>setToast(null)}/>
  </AppShell>;
}
