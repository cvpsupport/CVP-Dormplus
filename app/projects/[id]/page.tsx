import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Badge, StatCard } from '@/components/ui';
import { Icon } from '@/components/icons';
import { projectTasks, projects } from '@/lib/mock-data';

const statusLabel = { active: 'เปิดให้บริการ', planning: 'เตรียมเปิด', renovation: 'ปรับปรุง' } as const;
const statusTone = { active: 'green', planning: 'blue', renovation: 'amber' } as const;

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.find(p => p.id === id);
  if (!project) notFound();

  const occupancy = project.totalRooms ? Math.round(project.occupiedRooms / project.totalRooms * 100) : 0;
  const tasks = projectTasks.filter(t => t.projectId === project.id);
  const vacant = project.totalRooms - project.occupiedRooms;

  return <AppShell>
    <div className="project-detail-header">
      <div>
        <Link href="/projects" className="back-link">← กลับไปหน้าโครงการ</Link>
        <div className="project-detail-title"><div><h1>{project.name}</h1><p>{project.code} · {project.type} · {project.address}</p></div><Badge tone={statusTone[project.status]}>{statusLabel[project.status]}</Badge></div>
      </div>
      <button className="primary-btn">แก้ไขโครงการ</button>
    </div>

    <div className="project-summary-banner">
      <div className="project-summary-art"><Icon name="project" size={44}/></div>
      <div className="project-summary-copy"><span>ภาพรวมโครงการ</span><h2>{project.name}</h2><p>{project.description}</p></div>
      <div className="project-summary-meta"><div><span>เปิดโครงการ</span><b>{project.openedAt}</b></div><div><span>ผู้ดูแล</span><b>{project.manager}</b></div></div>
    </div>

    <section className="stats-grid project-detail-stats">
      <StatCard icon="rooms" label="ห้องทั้งหมด" value={`${project.totalRooms} ห้อง`} note={`${vacant} ห้องว่าง`} />
      <StatCard icon="users" label="อัตราเข้าพัก" value={`${occupancy}%`} note={`${project.occupiedRooms} ห้องมีผู้เช่า`} tone="blue" />
      <StatCard icon="finance" label="รายได้เดือนนี้" value={`฿${project.monthlyRevenue.toLocaleString()}`} note="รายได้จากค่าเช่าและบริการ" tone="amber" />
      <StatCard icon="project" label="โครงสร้าง" value={`${project.buildings} อาคาร`} note={`${project.floors} ชั้นต่ออาคารโดยประมาณ`} />
    </section>

    <div className="project-detail-grid">
      <section className="panel">
        <div className="panel-head"><div><h3>อาคารและพื้นที่</h3><p>โครงสร้างภายในโครงการ</p></div><button className="link-btn">+ เพิ่มอาคาร</button></div>
        <div className="building-list">
          {Array.from({ length: project.buildings }).map((_, index) => <div className="building-row" key={index}>
            <div className="building-icon"><Icon name="project" size={20}/></div>
            <div className="building-info"><b>อาคาร {String.fromCharCode(65 + index)}</b><span>{project.floors} ชั้น · {Math.ceil(project.totalRooms / project.buildings)} ห้อง</span></div>
            <Badge tone="green">ใช้งาน</Badge>
            <button className="icon-btn"><Icon name="chevron" size={16}/></button>
          </div>)}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>ข้อมูลโครงการ</h3><p>รายละเอียดสำคัญสำหรับทีมบริหาร</p></div><button className="link-btn">แก้ไข</button></div>
        <div className="project-info-list">
          <div><span>รหัสโครงการ</span><b>{project.code}</b></div>
          <div><span>ประเภท</span><b>{project.type}</b></div>
          <div><span>ที่ตั้ง</span><b>{project.address}</b></div>
          <div><span>ผู้ดูแลหลัก</span><b>{project.manager}</b></div>
          <div><span>สถานะ</span><Badge tone={statusTone[project.status]}>{statusLabel[project.status]}</Badge></div>
        </div>
      </section>
    </div>

    <div className="project-detail-grid lower-project-grid">
      <section className="panel project-task-panel">
        <div className="panel-head"><div><h3>งานโครงการ</h3><p>ติดตามงานเปิดโครงการ ปรับปรุง และงานบริหาร</p></div><button className="primary-btn small-btn"><Icon name="plus" size={15}/> เพิ่มงาน</button></div>
        {tasks.length ? <div className="project-task-list">{tasks.map(task => <div className="project-task" key={task.id}>
          <div className="task-check"><Icon name="task" size={18}/></div>
          <div className="task-main"><b>{task.title}</b><span>{task.id} · ผู้รับผิดชอบ {task.assignee}</span></div>
          <div className="task-due"><span>กำหนดเสร็จ</span><b>{task.due}</b></div>
          <Badge tone={task.priority === 'สูง' ? 'red' : 'amber'}>{task.priority}</Badge>
          <Badge tone={task.status === 'กำลังทำ' ? 'blue' : 'gray'}>{task.status}</Badge>
        </div>)}</div> : <div className="empty-state"><Icon name="task" size={28}/><b>ยังไม่มีงานของโครงการนี้</b><span>สร้างงานเพื่อวางแผนเปิดหรือปรับปรุงโครงการ</span></div>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3>ทางลัด</h3><p>ไปยังข้อมูลที่เกี่ยวข้อง</p></div></div>
        <div className="project-shortcuts">
          <Link href="/rooms"><Icon name="rooms"/><div><b>ห้องพัก</b><span>ดูสถานะห้องทั้งหมด</span></div><Icon name="chevron" size={16}/></Link>
          <Link href="/tenants"><Icon name="users"/><div><b>ผู้เช่า</b><span>รายชื่อและสัญญา</span></div><Icon name="chevron" size={16}/></Link>
          <Link href="/billing"><Icon name="finance"/><div><b>การเงิน</b><span>รายรับและใบแจ้งหนี้</span></div><Icon name="chevron" size={16}/></Link>
          <Link href="/maintenance"><Icon name="wrench"/><div><b>แจ้งซ่อม</b><span>งานซ่อมภายในโครงการ</span></div><Icon name="chevron" size={16}/></Link>
        </div>
      </section>
    </div>
  </AppShell>;
}
