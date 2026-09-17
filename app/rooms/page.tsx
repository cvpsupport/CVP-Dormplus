'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle } from '@/components/ui';
import { Icon } from '@/components/icons';
import { CrudMenu, EmptyState, FormActions, Modal, Toast } from '@/components/crud-ui';
import { useWorkspace } from '@/lib/workspace';

type Room = { id:string; property_id:string; room_number:string; floor_number:number|null; monthly_rent:number; deposit_amount:number; size_sqm:number|null; status:string; building_id:string|null };
type Building = { id:string; name:string };
const label: Record<string,string> = {occupied:'มีผู้เช่า',vacant:'ว่าง',reserved:'จองแล้ว',maintenance:'ซ่อมบำรุง',inactive:'ปิดใช้งาน'};
const tone: Record<string,string> = {occupied:'green',vacant:'gray',reserved:'blue',maintenance:'red',inactive:'gray'};
const emptyForm = { room_number:'', floor_number:'1', monthly_rent:'3500', deposit_amount:'3500', size_sqm:'28', status:'vacant', building_id:'' };

export default function RoomsPage(){
  const workspace = useWorkspace();
  const [rooms,setRooms]=useState<Room[]>([]);
  const [buildings,setBuildings]=useState<Building[]>([]);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');
  const [buildingFilter,setBuildingFilter]=useState('');
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState<Room|null>(null);
  const [form,setForm]=useState(emptyForm);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState<{message:string;tone:'success'|'error'}|null>(null);

  async function load(){
    if(!workspace.supabase||!workspace.activePropertyId) { setRooms([]); return; }
    const pid=workspace.activePropertyId;
    const [{data:r,error},{data:b}] = await Promise.all([
      workspace.supabase.from('rooms').select('id,property_id,room_number,floor_number,monthly_rent,deposit_amount,size_sqm,status,building_id').eq('property_id',pid).is('archived_at',null).order('room_number'),
      workspace.supabase.from('buildings').select('id,name').eq('property_id',pid).order('name')
    ]);
    if(error) setToast({message:error.message,tone:'error'}); else setRooms((r||[]) as Room[]);
    setBuildings((b||[]) as Building[]);
  }
  useEffect(()=>{ setBuildingFilter(''); void load(); },[workspace.activePropertyId]);

  function createNew(){ setEditing(null); setForm(emptyForm); setOpen(true); }
  function editRoom(r:Room){ setEditing(r); setForm({room_number:r.room_number,floor_number:String(r.floor_number||1),monthly_rent:String(r.monthly_rent),deposit_amount:String(r.deposit_amount),size_sqm:String(r.size_sqm||''),status:r.status,building_id:r.building_id||''}); setOpen(true); }
  async function submit(e:FormEvent){ e.preventDefault(); if(!workspace.supabase||!workspace.activePropertyId)return; setSaving(true);
    const payload={ room_number:form.room_number.trim(), floor_number:Number(form.floor_number)||null, monthly_rent:Number(form.monthly_rent)||0, deposit_amount:Number(form.deposit_amount)||0, size_sqm:form.size_sqm?Number(form.size_sqm):null, status:form.status, building_id:form.building_id||null, updated_at:new Date().toISOString() };
    const result=editing ? await workspace.supabase.from('rooms').update(payload).eq('id',editing.id) : await workspace.supabase.from('rooms').insert({...payload,property_id:workspace.activePropertyId});
    if(result.error) setToast({message:result.error.message,tone:'error'}); else { setToast({message:editing?'แก้ไขห้องเรียบร้อย':'เพิ่มห้องเรียบร้อย',tone:'success'}); setOpen(false); await load(); }
    setSaving(false);
  }
  async function remove(r:Room){ if(!workspace.supabase||!window.confirm(`ลบห้อง ${r.room_number} ออกจากรายการ? ประวัติเดิมจะยังถูกเก็บไว้`))return; const {error}=await workspace.supabase.from('rooms').update({archived_at:new Date().toISOString(),status:'inactive'}).eq('id',r.id); if(error)setToast({message:error.message,tone:'error'}); else {setToast({message:'ลบห้องออกจากรายการแล้ว',tone:'success'});await load();}}
  const buildingRooms=buildingFilter?rooms.filter(r=>r.building_id===buildingFilter):rooms;
  const filtered=buildingRooms.filter(r=>(filter==='all'||r.status===filter)&&r.room_number.toLowerCase().includes(search.toLowerCase()));
  const occupied=buildingRooms.filter(r=>r.status==='occupied').length, vacant=buildingRooms.filter(r=>r.status==='vacant').length;

  return <AppShell>
    <PageTitle title="จัดการห้องพัก" subtitle={workspace.activeProperty?`โครงการ ${workspace.activeProperty.name}`:'สร้างโครงการก่อนเพิ่มห้อง'} action={<button className="primary-btn" onClick={createNew} disabled={!workspace.activePropertyId}><Icon name="plus" size={18}/> เพิ่มห้อง</button>}/>
    <div className="toolbar"><div className="meter-filter-group"><div className="search-box"><Icon name="search" size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาเลขห้อง..."/></div><label className="building-filter"><Icon name="project" size={17}/><span>อาคาร</span><select value={buildingFilter} onChange={e=>setBuildingFilter(e.target.value)}><option value="">ทุกอาคาร ({rooms.length})</option>{buildings.map(b=><option key={b.id} value={b.id}>{b.name} ({rooms.filter(r=>r.building_id===b.id).length})</option>)}</select><Icon name="chevron-down" size={15}/></label></div><div className="filter-pills"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>ทั้งหมด {buildingRooms.length}</button><button className={filter==='occupied'?'active':''} onClick={()=>setFilter('occupied')}>มีผู้เช่า {occupied}</button><button className={filter==='vacant'?'active':''} onClick={()=>setFilter('vacant')}>ว่าง {vacant}</button></div></div>
    {!workspace.activePropertyId ? <EmptyState title="ยังไม่มีโครงการ" description="ไปที่เมนูโครงการแล้วสร้างโครงการแรกก่อน"/> : !filtered.length ? <EmptyState title="ยังไม่มีห้องพัก" description="กดเพิ่มห้องเพื่อเริ่มบันทึกข้อมูลจริง" action={<button className="primary-btn" onClick={createNew}><Icon name="plus" size={17}/> เพิ่มห้อง</button>}/> :
    <div className="rooms-grid">{filtered.map((r,i)=><article className="room-card" key={r.id}>
      <div className={`room-photo room-style-${i%3}`}><Badge tone={tone[r.status]||'gray'}>{label[r.status]||r.status}</Badge><div className="room-scene" aria-hidden="true"><div className="scene-window"><i/><i/></div><div className="scene-bed"><i/><span/></div><div className="scene-table"/><div className="scene-plant"><i/><i/><i/></div></div><div className="room-number-watermark">{r.room_number}</div></div>
      <div className="room-body"><div><div><span className="room-kicker">ROOM</span><h3>ห้อง {r.room_number}</h3></div><strong>฿ {Number(r.monthly_rent).toLocaleString()} <small>/ เดือน</small></strong></div><p>{buildings.find(b=>b.id===r.building_id)?.name||'ยังไม่ระบุอาคาร'}</p><div className="room-meta"><span>ชั้น {r.floor_number||'-'}</span><span>{r.size_sqm||'-'} ตร.ม.</span><span>มัดจำ ฿{Number(r.deposit_amount).toLocaleString()}</span></div><CrudMenu onEdit={()=>editRoom(r)} onDelete={()=>void remove(r)}/></div>
    </article>)}</div>}

    <Modal open={open} title={editing?'แก้ไขห้อง':'เพิ่มห้อง'} onClose={()=>setOpen(false)}><form className="crud-form" onSubmit={submit}><div className="form-grid">
      <label>เลขห้อง<input required value={form.room_number} onChange={e=>setForm({...form,room_number:e.target.value})}/></label><label>อาคาร<select value={form.building_id} onChange={e=>setForm({...form,building_id:e.target.value})}><option value="">ไม่ระบุ</option>{buildings.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label>ชั้น<input type="number" min="1" value={form.floor_number} onChange={e=>setForm({...form,floor_number:e.target.value})}/></label><label>สถานะ<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="vacant">ว่าง</option><option value="occupied">มีผู้เช่า</option><option value="reserved">จองแล้ว</option><option value="maintenance">ซ่อมบำรุง</option><option value="inactive">ปิดใช้งาน</option></select></label>
      <label>ค่าเช่า/เดือน<input type="number" min="0" value={form.monthly_rent} onChange={e=>setForm({...form,monthly_rent:e.target.value})}/></label><label>เงินประกัน<input type="number" min="0" value={form.deposit_amount} onChange={e=>setForm({...form,deposit_amount:e.target.value})}/></label><label>ขนาด (ตร.ม.)<input type="number" min="0" step="0.01" value={form.size_sqm} onChange={e=>setForm({...form,size_sqm:e.target.value})}/></label>
    </div><FormActions saving={saving} onCancel={()=>setOpen(false)}/></form></Modal>
    <Toast message={toast?.message||null} tone={toast?.tone} onClose={()=>setToast(null)}/>
  </AppShell>
}
