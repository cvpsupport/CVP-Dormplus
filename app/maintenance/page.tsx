import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, StatCard } from '@/components/ui';
import { Icon } from '@/components/icons';
import { maintenance } from '@/lib/mock-data';

export default function MaintenancePage(){
  return <AppShell>
    <PageTitle title="แจ้งซ่อม" subtitle="ติดตามงานซ่อม ผู้รับผิดชอบ และสถานะล่าสุด" action={<button className="primary-btn"><Icon name="plus" size={18}/> สร้างรายการ</button>}/>
    <section className="stats-grid compact"><StatCard icon="wrench" label="งานทั้งหมด" value="18 งาน" note="เดือนนี้"/><StatCard icon="bell" label="งานใหม่" value="3 งาน" note="ต้องตรวจสอบ" tone="amber"/><StatCard icon="settings" label="กำลังซ่อม" value="4 งาน" note="2 ช่างกำลังทำงาน" tone="blue"/><StatCard icon="chart" label="ปิดงานแล้ว" value="11 งาน" note="เฉลี่ย 1.8 วัน" tone="green"/></section>
    <div className="ticket-board">{['ใหม่','กำลังดำเนินการ','เสร็จสิ้น'].map((col,idx)=><section className="ticket-column" key={col}><div className="ticket-col-head"><h3>{col}</h3><span>{idx===0?1:idx===1?2:0}</span></div>{maintenance.filter((_,i)=>idx===0?i===2:idx===1?i<2:false).map(t=><article className="ticket-card" key={t.id}><div className="ticket-id">{t.id}<Badge tone={t.priority==='สูง'?'red':t.priority==='กลาง'?'amber':'gray'}>{t.priority}</Badge></div><h4>{t.issue}</h4><p>ห้อง {t.room} · {t.assignee}</p><div className="ticket-foot"><span>{t.time}</span><button>เปิดงาน</button></div></article>)}</section>)}</div>
  </AppShell>
}
