import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, StatCard } from '@/components/ui';
import { Icon } from '@/components/icons';
import { rooms } from '@/lib/mock-data';

export default function DashboardPage() {
  return <AppShell>
    <PageTitle title="สวัสดีครับ คุณกอบ 👋" subtitle="ภาพรวมการบริหาร Green Park Residence วันนี้" action={<div className="date-chip"><Icon name="calendar" size={15}/><span>17 ก.ย. 2569</span></div>} />

    <section className="dashboard-hero">
      <div className="dashboard-hero-copy">
        <span className="hero-kicker"><Icon name="sparkles" size={15}/> สรุปประจำเดือนกันยายน</span>
        <h2>หอพักของคุณกำลังไปได้ดี<br/><em>อัตราเข้าพัก 88%</em></h2>
        <p>รายรับเดือนนี้เพิ่มขึ้น 12% และมีเพียง 3 งานซ่อมที่ต้องติดตาม</p>
        <div className="hero-actions">
          <Link href="/billing" className="hero-primary"><Icon name="receipt" size={16}/> ดูการเงิน</Link>
          <Link href="/rooms" className="hero-secondary">ดูสถานะห้อง <Icon name="chevron" size={15}/></Link>
        </div>
      </div>
      <div className="hero-metrics">
        <div><span>รายรับ</span><strong>฿126.5K</strong><small><Icon name="arrowup" size={12}/> 12.4%</small></div>
        <div><span>เก็บเงินแล้ว</span><strong>93.6%</strong><small>45 / 48 ห้อง</small></div>
      </div>
      <div className="hero-building-visual" aria-hidden="true">
        <div className="building building-a"><i/><i/><i/><i/><i/><i/></div>
        <div className="building building-b"><i/><i/><i/><i/><i/><i/><i/><i/></div>
        <div className="hero-ground"/>
      </div>
    </section>

    <section className="stats-grid">
      <StatCard icon="rooms" label="ห้องทั้งหมด" value="48 ห้อง" note="ว่าง 6 ห้อง · มีผู้เช่า 42 ห้อง"/>
      <StatCard icon="users" label="ผู้เช่าทั้งหมด" value="42 คน" note="ย้ายเข้าใหม่ 4 คนในเดือนนี้" tone="blue"/>
      <StatCard icon="finance" label="รายได้เดือนนี้" value="฿126,500" note="↑ 12% จากเดือนก่อน" tone="amber"/>
      <StatCard icon="wrench" label="แจ้งซ่อมค้าง" value="3 รายการ" note="2 รายการกำลังดำเนินการ" tone="red"/>
    </section>

    <div className="dashboard-grid">
      <section className="panel wide chart-panel">
        <div className="panel-head"><div><h3>กระแสเงินสด</h3><p>รายรับและรายจ่ายย้อนหลัง 6 เดือน</p></div><div className="chart-legend"><span><i className="income"/>รายรับ</span><span><i className="expense"/>รายจ่าย</span></div></div>
        <div className="chart-wrap">
          <div className="chart-grid-lines"><i/><i/><i/><i/></div>
          {[72,52,84,61,95,66].map((h,i)=><div key={i} className="bar-group"><div className="bars"><i style={{height:`${h}%`}}></i><i className="muted" style={{height:`${Math.max(28,h-26)}%`}}></i></div><span>{['เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.'][i]}</span></div>)}
        </div>
        <div className="finance-summary"><div><span>รายรับรวม</span><b>฿126,500</b><small>+12.4%</small></div><div><span>รายจ่ายรวม</span><b>฿52,300</b><small className="negative">+5.1%</small></div><div><span>กำไรสุทธิ</span><b className="positive">฿74,200</b><small>Margin 58.7%</small></div></div>
      </section>

      <section className="panel occupancy">
        <div className="panel-head"><div><h3>สถานะห้องพัก</h3><p>อัปเดตล่าสุดเมื่อสักครู่</p></div><Link href="/rooms">ดูทั้งหมด</Link></div>
        <div className="donut"><div className="donut-center"><small>Occupancy</small><b>88%</b><span>42 / 48 ห้อง</span></div></div>
        <div className="legend"><span><i></i>มีผู้เช่า <b>42 ห้อง</b></span><span><i className="empty"></i>ว่าง <b>6 ห้อง</b></span></div>
        <Link href="/rooms" className="soft-action">จัดการห้องพัก <Icon name="chevron" size={15}/></Link>
      </section>
    </div>

    <div className="dashboard-grid lower">
      <section className="panel wide">
        <div className="panel-head"><div><h3>ห้องพักล่าสุด</h3><p>สถานะห้องและผู้เช่าที่เพิ่งอัปเดต</p></div><Link href="/rooms">ดูทั้งหมด</Link></div>
        <div className="room-mini-list">{rooms.slice(0,5).map((r,i)=><div key={r.id} className="room-mini"><div className={`room-thumb room-thumb-${i%3}`}><Icon name="rooms" size={17}/></div><div><b>{r.name}</b><span>{r.tenant}</span></div><strong>฿ {r.rent.toLocaleString()}</strong><Badge tone={r.status==='vacant'?'gray':'green'}>{r.status==='vacant'?'ว่าง':'มีผู้เช่า'}</Badge></div>)}</div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>การชำระล่าสุด</h3><p>รายการที่เข้ามาวันนี้</p></div><Link href="/billing">ดูทั้งหมด</Link></div>
        <div className="activity-list">{['พิมพ์ชนก ใจดี','กมลชนก พรมา','ศิริพร สุขใจ','ณัฐวุฒิ แสงทอง'].map((n,i)=><div key={n}><div className={`avatar tiny avatar-${i}`}>{n.slice(0,1)}</div><div><b>{n}</b><span>ห้อง {101+i} · ฿{[4350,4290,3980,4680][i].toLocaleString()}</span></div><Badge tone={i===3?'amber':'green'}>{i===3?'รอตรวจ':'ชำระแล้ว'}</Badge></div>)}</div>
      </section>
    </div>
  </AppShell>;
}
