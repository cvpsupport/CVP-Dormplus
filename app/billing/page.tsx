'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, StatCard } from '@/components/ui';
import { Icon } from '@/components/icons';
import { CrudMenu, EmptyState, FormActions, Modal, Toast } from '@/components/crud-ui';
import { useWorkspace } from '@/lib/workspace';

type Invoice={id:string;invoice_number:string;contract_id:string;billing_period:string;issue_date:string;due_date:string;subtotal:number;total:number;status:string};
type Contract={id:string;contract_number:string;tenant_id:string;room_id:string;rent_amount:number;status:string};
type Tenant={id:string;full_name:string};
type Room={id:string;room_number:string;building_id:string|null};
type Building={id:string;name:string};
const emptyForm={contract_id:'',billing_period:new Date().toISOString().slice(0,7)+'-01',due_date:'',total:'',status:'issued'};
const statusLabel:Record<string,string>={draft:'ร่าง',issued:'รอชำระ',partially_paid:'ชำระบางส่วน',paid:'ชำระแล้ว',overdue:'เกินกำหนด',cancelled:'ยกเลิก'};
const statusTone:Record<string,string>={draft:'gray',issued:'amber',partially_paid:'blue',paid:'green',overdue:'red',cancelled:'gray'};

export default function BillingPage(){
  const workspace=useWorkspace();
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [contracts,setContracts]=useState<Contract[]>([]);
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [rooms,setRooms]=useState<Room[]>([]);
  const [buildings,setBuildings]=useState<Building[]>([]);
  const [search,setSearch]=useState('');
  const [buildingFilter,setBuildingFilter]=useState('');
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState<Invoice|null>(null);
  const [form,setForm]=useState(emptyForm);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState<{message:string;tone:'success'|'error'}|null>(null);

  async function load(){
    if(!workspace.supabase||!workspace.activePropertyId){setInvoices([]);return;}const pid=workspace.activePropertyId;
    const [i,c,t,r,b]=await Promise.all([
      workspace.supabase.from('invoices').select('id,invoice_number,contract_id,billing_period,issue_date,due_date,subtotal,total,status').eq('property_id',pid).order('created_at',{ascending:false}),
      workspace.supabase.from('contracts').select('id,contract_number,tenant_id,room_id,rent_amount,status').eq('property_id',pid).eq('status','active').order('created_at',{ascending:false}),
      workspace.supabase.from('tenants').select('id,full_name').eq('property_id',pid),
      workspace.supabase.from('rooms').select('id,room_number,building_id').eq('property_id',pid).is('archived_at',null),
      workspace.supabase.from('buildings').select('id,name').eq('property_id',pid).order('name')
    ]);
    if(i.error)setToast({message:i.error.message,tone:'error'});else setInvoices((i.data||[]) as Invoice[]);setContracts((c.data||[]) as Contract[]);setTenants((t.data||[]) as Tenant[]);setRooms((r.data||[]) as Room[]);setBuildings((b.data||[]) as Building[]);
  }
  useEffect(()=>{setBuildingFilter('');void load();},[workspace.activePropertyId]);
  const tenantMap=useMemo(()=>new Map(tenants.map(x=>[x.id,x.full_name])),[tenants]);
  const roomMap=useMemo(()=>new Map(rooms.map(x=>[x.id,x.room_number])),[rooms]);
  const contractMap=useMemo(()=>new Map(contracts.map(x=>[x.id,x])),[contracts]);

  const visibleContracts=contracts.filter(c=>{const room=rooms.find(r=>r.id===c.room_id);return !buildingFilter||room?.building_id===buildingFilter;});
  function newInvoice(){setEditing(null);const c=visibleContracts[0];setForm({...emptyForm,contract_id:c?.id||'',total:c?String(c.rent_amount):'',due_date:new Date(Date.now()+7*86400000).toISOString().slice(0,10)});setOpen(true);}
  function editInvoice(i:Invoice){setEditing(i);setForm({contract_id:i.contract_id,billing_period:i.billing_period,due_date:i.due_date,total:String(i.total),status:i.status});setOpen(true);}
  function chooseContract(id:string){const c=contracts.find(x=>x.id===id);setForm({...form,contract_id:id,total:c?String(c.rent_amount):form.total});}
  async function submit(e:FormEvent){e.preventDefault();if(!workspace.supabase||!workspace.activePropertyId)return;setSaving(true);const amount=Number(form.total)||0;
    if(editing){const {error}=await workspace.supabase.from('invoices').update({contract_id:form.contract_id,billing_period:form.billing_period,due_date:form.due_date,subtotal:amount,total:amount,status:form.status,updated_at:new Date().toISOString()}).eq('id',editing.id);if(error)setToast({message:error.message,tone:'error'});else{setToast({message:'แก้ไขใบแจ้งหนี้แล้ว',tone:'success'});setOpen(false);await load();}}
    else {const invoiceNo=`INV-${new Date().toISOString().slice(2,7).replace('-','')}-${Date.now().toString().slice(-4)}`;const {data,error}=await workspace.supabase.from('invoices').insert({property_id:workspace.activePropertyId,contract_id:form.contract_id,invoice_number:invoiceNo,billing_period:form.billing_period,issue_date:new Date().toISOString().slice(0,10),due_date:form.due_date,subtotal:amount,total:amount,status:form.status}).select('id').single();if(error||!data)setToast({message:error?.message||'สร้างใบแจ้งหนี้ไม่สำเร็จ',tone:'error'});else{await workspace.supabase.from('invoice_items').insert({invoice_id:data.id,item_type:'rent',description:'ค่าเช่าห้อง',quantity:1,unit_price:amount,amount});setToast({message:'สร้างใบแจ้งหนี้แล้ว',tone:'success'});setOpen(false);await load();}}
    setSaving(false);
  }
  async function remove(i:Invoice){if(!workspace.supabase||!window.confirm(`ลบใบแจ้งหนี้ ${i.invoice_number}?`))return;const {error}=await workspace.supabase.from('invoices').delete().eq('id',i.id);if(error)setToast({message:error.message,tone:'error'});else{setToast({message:'ลบใบแจ้งหนี้แล้ว',tone:'success'});await load();}}

  const buildingInvoices=invoices.filter(i=>{const c=contractMap.get(i.contract_id);const room=c?rooms.find(r=>r.id===c.room_id):undefined;return !buildingFilter||room?.building_id===buildingFilter;});
  const totalPaid=buildingInvoices.filter(i=>i.status==='paid').reduce((s,i)=>s+Number(i.total),0);const pending=buildingInvoices.filter(i=>['issued','partially_paid'].includes(i.status)).reduce((s,i)=>s+Number(i.total),0);const overdue=buildingInvoices.filter(i=>i.status==='overdue').reduce((s,i)=>s+Number(i.total),0);const collection=buildingInvoices.length?Math.round(buildingInvoices.filter(i=>i.status==='paid').length/buildingInvoices.length*100):0;
  const filtered=buildingInvoices.filter(i=>{const c=contractMap.get(i.contract_id);const room=c?roomMap.get(c.room_id)||'':'';const tenant=c?tenantMap.get(c.tenant_id)||'':'';return `${i.invoice_number} ${room} ${tenant}`.toLowerCase().includes(search.toLowerCase());});
  return <AppShell>
    <PageTitle title="การเงินและการชำระ" subtitle="สร้าง แก้ไข และลบใบแจ้งหนี้จาก Supabase" action={workspace.can('billing.create')?<button className="primary-btn" onClick={newInvoice} disabled={!visibleContracts.length}><Icon name="plus" size={18}/> สร้างใบแจ้งหนี้</button>:undefined}/>
    <section className="stats-grid compact"><StatCard icon="finance" label="ชำระแล้ว" value={`฿${totalPaid.toLocaleString()}`} note={`${buildingInvoices.filter(i=>i.status==='paid').length} รายการ`}/><StatCard icon="contract" label="รอชำระ" value={`฿${pending.toLocaleString()}`} note="ยอดค้างปัจจุบัน" tone="amber"/><StatCard icon="bell" label="เกินกำหนด" value={`฿${overdue.toLocaleString()}`} note={`${buildingInvoices.filter(i=>i.status==='overdue').length} รายการ`} tone="red"/><StatCard icon="chart" label="อัตราเก็บเงิน" value={`${collection}%`} note="จากจำนวนใบแจ้งหนี้" tone="blue"/></section>
    <div className="toolbar"><div className="meter-filter-group"><div className="search-box"><Icon name="search" size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาเลขที่บิล ห้อง หรือผู้เช่า..."/></div><label className="building-filter"><Icon name="project" size={17}/><span>อาคาร</span><select value={buildingFilter} onChange={e=>setBuildingFilter(e.target.value)}><option value="">ทุกอาคาร ({rooms.length})</option>{buildings.map(b=><option key={b.id} value={b.id}>{b.name} ({rooms.filter(r=>r.building_id===b.id).length} ห้อง)</option>)}</select><Icon name="chevron-down" size={15}/></label></div></div>
    {!workspace.activePropertyId?<EmptyState title="ยังไม่มีโครงการ" description="สร้างโครงการก่อนใช้งานการเงิน"/>:!contracts.length&&!invoices.length?<EmptyState title="ยังไม่มีสัญญาเช่า" description="เพิ่มผู้เช่าและเลือกห้องก่อน ระบบจึงจะสร้างสัญญาและใบแจ้งหนี้ได้"/>:!filtered.length?<EmptyState title="ยังไม่มีใบแจ้งหนี้" description="กดสร้างใบแจ้งหนี้เพื่อเริ่มต้น" action={workspace.can('billing.create')?<button className="primary-btn" onClick={newInvoice}><Icon name="plus" size={17}/> สร้างใบแจ้งหนี้</button>:undefined}/>:<section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>เลขที่</th><th>ห้อง</th><th>ผู้เช่า</th><th>ยอดรวม</th><th>ครบกำหนด</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>{filtered.map(i=>{const c=contractMap.get(i.contract_id);return <tr key={i.id}><td><b>{i.invoice_number}</b></td><td>{c?roomMap.get(c.room_id)||'-':'-'}</td><td>{c?tenantMap.get(c.tenant_id)||'-':'-'}</td><td><b>฿{Number(i.total).toLocaleString()}</b></td><td>{i.due_date}</td><td><Badge tone={statusTone[i.status]||'gray'}>{statusLabel[i.status]||i.status}</Badge></td><td><CrudMenu canEdit={workspace.can('billing.update')} canDelete={workspace.can('billing.delete')} onEdit={()=>editInvoice(i)} onDelete={()=>void remove(i)}/></td></tr>})}</tbody></table></div></section>}

    <Modal open={open} title={editing?'แก้ไขใบแจ้งหนี้':'สร้างใบแจ้งหนี้'} onClose={()=>setOpen(false)}><form className="crud-form" onSubmit={submit}><div className="form-grid"><label className="full">สัญญา<select required value={form.contract_id} onChange={e=>chooseContract(e.target.value)} disabled={!!editing}><option value="">เลือกสัญญา</option>{visibleContracts.map(c=><option key={c.id} value={c.id}>ห้อง {roomMap.get(c.room_id)||'-'} · {tenantMap.get(c.tenant_id)||'-'} · {c.contract_number}</option>)}</select></label><label>รอบบิล<input type="date" required value={form.billing_period} onChange={e=>setForm({...form,billing_period:e.target.value})}/></label><label>ครบกำหนด<input type="date" required value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label><label>ยอดรวม<input type="number" min="0" required value={form.total} onChange={e=>setForm({...form,total:e.target.value})}/></label><label>สถานะ<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="draft">ร่าง</option><option value="issued">รอชำระ</option><option value="partially_paid">ชำระบางส่วน</option><option value="paid">ชำระแล้ว</option><option value="overdue">เกินกำหนด</option><option value="cancelled">ยกเลิก</option></select></label></div><FormActions saving={saving} onCancel={()=>setOpen(false)}/></form></Modal><Toast message={toast?.message||null} tone={toast?.tone} onClose={()=>setToast(null)}/>
  </AppShell>;
}
