'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, StatCard } from '@/components/ui';
import { Icon } from '@/components/icons';
import { EmptyState } from '@/components/crud-ui';
import { useWorkspace } from '@/lib/workspace';

type Room={id:string;room_number:string;monthly_rent:number;status:string};
type Invoice={id:string;total:number;status:string;due_date:string};

export default function DashboardPage() {
  const workspace=useWorkspace();
  const [rooms,setRooms]=useState<Room[]>([]);
  const [tenantCount,setTenantCount]=useState(0);
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [maintenanceCount,setMaintenanceCount]=useState(0);

  useEffect(()=>{(async()=>{
    if(!workspace.supabase||!workspace.activePropertyId){setRooms([]);setTenantCount(0);setInvoices([]);setMaintenanceCount(0);return;}
    const pid=workspace.activePropertyId;
    const [r,t,i,m]=await Promise.all([
      workspace.supabase.from('rooms').select('id,room_number,monthly_rent,status').eq('property_id',pid).is('archived_at',null).order('room_number'),
      workspace.supabase.from('tenants').select('*',{count:'exact',head:true}).eq('property_id',pid).is('archived_at',null),
      workspace.supabase.from('invoices').select('id,total,status,due_date').eq('property_id',pid).order('created_at',{ascending:false}),
      workspace.supabase.from('maintenance_tickets').select('*',{count:'exact',head:true}).eq('property_id',pid).not('status','in','(completed,cancelled)')
    ]);
    setRooms((r.data||[]) as Room[]);setTenantCount(t.count||0);setInvoices((i.data||[]) as Invoice[]);setMaintenanceCount(m.count||0);
  })()},[workspace.activePropertyId]);

  const occupied=rooms.filter(r=>r.status==='occupied').length;
  const vacant=rooms.filter(r=>r.status==='vacant').length;
  const occupancy=rooms.length?Math.round(occupied/rooms.length*100):0;
  const paid=invoices.filter(i=>i.status==='paid');
  const revenue=paid.reduce((s,i)=>s+Number(i.total),0);
  const pending=invoices.filter(i=>['issued','partially_paid','overdue'].includes(i.status)).reduce((s,i)=>s+Number(i.total),0);
  const dateText=new Intl.DateTimeFormat('th-TH',{dateStyle:'medium'}).format(new Date());

  return <AppShell>
    <PageTitle title={`สวัสดีครับ ${workspace.userName} 👋`} subtitle={workspace.activeProperty?`ภาพรวม ${workspace.activeProperty.name}`:'เริ่มต้นด้วยการสร้างโครงการแรก'} action={<div className="date-chip"><Icon name="calendar" size={15}/><span>{dateText}</span></div>} />
    {!workspace.activePropertyId ? <EmptyState title="ยังไม่มีโครงการ" description="ไปที่เมนูโครงการเพื่อสร้างโครงการแรก แล้วข้อมูล Dashboard จะอัปเดตอัตโนมัติ" action={<Link className="primary-btn" href="/projects"><Icon name="plus" size={17}/> สร้างโครงการ</Link>}/> : <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy"><span className="hero-kicker"><Icon name="sparkles" size={15}/> LIVE PORTFOLIO</span><h2>ข้อมูลจริงจาก Supabase<br/><em>อัตราเข้าพัก {occupancy}%</em></h2><p>Dashboard นี้คำนวณจากห้อง ผู้เช่า ใบแจ้งหนี้ และงานซ่อมของโครงการปัจจุบัน</p><div className="hero-actions"><Link href="/billing" className="hero-primary"><Icon name="receipt" size={16}/> ดูการเงิน</Link><Link href="/rooms" className="hero-secondary">ดูสถานะห้อง <Icon name="chevron" size={15}/></Link></div></div>
        <div className="hero-metrics"><div><span>รับชำระแล้ว</span><strong>฿{revenue.toLocaleString()}</strong><small>{paid.length} ใบแจ้งหนี้</small></div><div><span>ยอดค้าง</span><strong>฿{pending.toLocaleString()}</strong><small>{invoices.filter(i=>i.status!=='paid'&&i.status!=='cancelled').length} รายการ</small></div></div>
        <div className="hero-building-visual" aria-hidden="true"><div className="building building-a"><i/><i/><i/><i/><i/><i/></div><div className="building building-b"><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="hero-ground"/></div>
      </section>
      <section className="stats-grid"><StatCard icon="rooms" label="ห้องทั้งหมด" value={`${rooms.length} ห้อง`} note={`ว่าง ${vacant} · มีผู้เช่า ${occupied}`}/><StatCard icon="users" label="ผู้เช่าทั้งหมด" value={`${tenantCount} คน`} note="ผู้เช่าปัจจุบัน" tone="blue"/><StatCard icon="finance" label="รับชำระแล้ว" value={`฿${revenue.toLocaleString()}`} note={`${paid.length} รายการ`} tone="amber"/><StatCard icon="wrench" label="งานซ่อมค้าง" value={`${maintenanceCount} รายการ`} note="ยังไม่ปิดงาน" tone="red"/></section>
      <div className="dashboard-grid">
        <section className="panel wide"><div className="panel-head"><div><h3>ห้องพักล่าสุด</h3><p>ข้อมูลจริงของโครงการปัจจุบัน</p></div><Link href="/rooms">ดูทั้งหมด</Link></div>{rooms.length?<div className="room-mini-list">{rooms.slice(0,6).map((r,i)=><div key={r.id} className="room-mini"><div className={`room-thumb room-thumb-${i%3}`}><Icon name="rooms" size={17}/></div><div><b>ห้อง {r.room_number}</b><span>{r.status==='occupied'?'มีผู้เช่า':r.status==='vacant'?'ว่าง':r.status}</span></div><strong>฿ {Number(r.monthly_rent).toLocaleString()}</strong><Badge tone={r.status==='occupied'?'green':r.status==='vacant'?'gray':'amber'}>{r.status==='occupied'?'มีผู้เช่า':r.status==='vacant'?'ว่าง':r.status}</Badge></div>)}</div>:<div className="empty-state"><b>ยังไม่มีห้องพัก</b><span>เพิ่มห้องจากเมนูห้องพัก</span></div>}</section>
        <section className="panel occupancy"><div className="panel-head"><div><h3>สถานะห้องพัก</h3><p>คำนวณจากข้อมูลล่าสุด</p></div><Link href="/rooms">ดูทั้งหมด</Link></div><div className="donut" style={{background:`conic-gradient(var(--green-500) 0 ${occupancy}%, #e6eeeb ${occupancy}% 100%)`}}><div className="donut-center"><small>Occupancy</small><b>{occupancy}%</b><span>{occupied} / {rooms.length} ห้อง</span></div></div><div className="legend"><span><i/>มีผู้เช่า <b>{occupied} ห้อง</b></span><span><i className="empty"/>ว่าง <b>{vacant} ห้อง</b></span></div><Link href="/rooms" className="soft-action">จัดการห้องพัก <Icon name="chevron" size={15}/></Link></section>
      </div>
    </>}
  </AppShell>;
}
