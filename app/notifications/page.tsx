'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { EmptyState, Toast } from '@/components/crud-ui';
import { Badge, PageTitle } from '@/components/ui';
import { useWorkspace } from '@/lib/workspace';

type Notification={id:string;event_key:string;title:string;body:string;severity:string;entity_type:string|null;entity_id:string|null;read_at:string|null;created_at:string};
const tone:Record<string,string>={info:'blue',success:'green',warning:'amber',error:'red'};
const eventLabel:Record<string,string>={invoice_due:'การเงิน',payment_received:'ชำระเงิน',maintenance_new:'แจ้งซ่อม',contract_expiring:'สัญญา',meter_anomaly:'มิเตอร์',test:'ทดสอบ',general:'ทั่วไป'};

export default function NotificationsPage(){
  const workspace=useWorkspace(); const [items,setItems]=useState<Notification[]>([]); const [filter,setFilter]=useState<'all'|'unread'>('all'); const [toast,setToast]=useState<{message:string;tone:'success'|'error'}|null>(null);
  async function load(){if(!workspace.supabase||!workspace.activePropertyId){setItems([]);return;}let q=workspace.supabase.from('notifications').select('id,event_key,title,body,severity,entity_type,entity_id,read_at,created_at').eq('property_id',workspace.activePropertyId).order('created_at',{ascending:false}).limit(100);const {data,error}=await q;if(error)setToast({message:error.message,tone:'error'});else setItems((data||[]) as Notification[])}
  useEffect(()=>{void load()},[workspace.activePropertyId]);
  async function markRead(id:string){if(!workspace.supabase)return;const {error}=await workspace.supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id);if(error)setToast({message:error.message,tone:'error'});else await load()}
  async function markAll(){if(!workspace.supabase||!workspace.activePropertyId)return;const {error}=await workspace.supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('property_id',workspace.activePropertyId).is('read_at',null);if(error)setToast({message:error.message,tone:'error'});else{setToast({message:'อ่านทั้งหมดแล้ว',tone:'success'});await load()}}
  const unread=items.filter(n=>!n.read_at).length; const visible=filter==='unread'?items.filter(n=>!n.read_at):items;
  return <AppShell><PageTitle title="ศูนย์แจ้งเตือน" subtitle="รวม In-App notifications ของโครงการปัจจุบัน" action={<button className="outline-btn" onClick={()=>void markAll()} disabled={!unread}><Icon name="check" size={17}/> อ่านทั้งหมด</button>}/><div className="toolbar"><div className="filter-pills"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>ทั้งหมด {items.length}</button><button className={filter==='unread'?'active':''} onClick={()=>setFilter('unread')}>ยังไม่อ่าน {unread}</button></div></div>{!workspace.activePropertyId?<EmptyState title="ยังไม่มีโครงการ" description="เลือกโครงการก่อนดูการแจ้งเตือน"/>:!visible.length?<EmptyState title={filter==='unread'?'ไม่มีแจ้งเตือนที่ยังไม่อ่าน':'ยังไม่มีการแจ้งเตือน'} description="เมื่อมีบิลใกล้ครบกำหนด สัญญาใกล้หมดอายุ งานซ่อม หรือมิเตอร์ผิดปกติ จะแสดงที่นี่"/>:<section className="panel notification-list">{visible.map(item=><article key={item.id} className={`notification-item ${item.read_at?'read':'unread'}`}><div className={`notification-event-icon ${item.severity}`}><Icon name={item.event_key==='meter_anomaly'?'meter':item.event_key==='maintenance_new'?'wrench':item.event_key==='invoice_due'?'receipt':item.event_key==='contract_expiring'?'contract':'bell'} size={19}/></div><div className="notification-copy"><div className="notification-title-line"><h3>{item.title}</h3><Badge tone={tone[item.severity]||'gray'}>{eventLabel[item.event_key]||item.event_key}</Badge></div><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString('th-TH')}</small></div>{!item.read_at&&<button className="notification-read-btn" onClick={()=>void markRead(item.id)}>ทำเครื่องหมายว่าอ่านแล้ว</button>}</article>)}</section>}<Toast message={toast?.message||null} tone={toast?.tone} onClose={()=>setToast(null)}/></AppShell>
}
