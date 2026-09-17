import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, SearchBox, StatCard } from '@/components/ui';
import { Icon } from '@/components/icons';
import { projects } from '@/lib/mock-data';

const statusLabel = { active: 'เปิดให้บริการ', planning: 'เตรียมเปิด', renovation: 'ปรับปรุง' } as const;
const statusTone = { active: 'green', planning: 'blue', renovation: 'amber' } as const;

export default function ProjectsPage() {
  const active = projects.filter(p => p.status === 'active').length;
  const totalRooms = projects.reduce((sum, p) => sum + p.totalRooms, 0);
  const occupied = projects.reduce((sum, p) => sum + p.occupiedRooms, 0);
  const revenue = projects.reduce((sum, p) => sum + p.monthlyRevenue, 0);
  const occupancy = Math.round((occupied / totalRooms) * 100);

  return <AppShell>
    <PageTitle
      title="โครงการ"
      subtitle="บริหารหลายหอพักหรืออพาร์ตเมนต์จากศูนย์กลางเดียว"
      action={<button className="primary-btn"><Icon name="plus" size={18}/> เพิ่มโครงการ</button>}
    />

    <section className="stats-grid project-stats">
      <StatCard icon="project" label="โครงการทั้งหมด" value={`${projects.length} โครงการ`} note={`${active} โครงการเปิดให้บริการ`} />
      <StatCard icon="rooms" label="ห้องรวมทั้งหมด" value={`${totalRooms} ห้อง`} note={`มีผู้เช่า ${occupied} ห้อง`} tone="blue" />
      <StatCard icon="users" label="อัตราเข้าพักรวม" value={`${occupancy}%`} note={`${totalRooms - occupied} ห้องยังว่าง`} tone="amber" />
      <StatCard icon="finance" label="รายได้รวมเดือนนี้" value={`฿${revenue.toLocaleString()}`} note="จากโครงการที่เปิดให้บริการ" />
    </section>

    <div className="toolbar project-toolbar">
      <SearchBox placeholder="ค้นหาชื่อโครงการ, รหัส, ทำเล..."/>
      <div className="filter-pills"><button className="active">ทั้งหมด {projects.length}</button><button>เปิดให้บริการ {active}</button><button>กำลังพัฒนา 2</button></div>
    </div>

    <section className="projects-grid">
      {projects.map(project => {
        const occupancyRate = project.totalRooms ? Math.round(project.occupiedRooms / project.totalRooms * 100) : 0;
        return <article className="project-card" key={project.id}>
          <div className="project-cover">
            <div className="project-building-art"><span></span><span></span><span></span></div>
            <Badge tone={statusTone[project.status]}>{statusLabel[project.status]}</Badge>
            <div className="project-code">{project.code}</div>
          </div>
          <div className="project-body">
            <div className="project-title-row"><div><h3>{project.name}</h3><p>{project.type}</p></div><div className="project-building-count"><Icon name="project" size={16}/>{project.buildings} อาคาร</div></div>
            <div className="project-location"><Icon name="map" size={15}/><span>{project.address}</span></div>
            <div className="project-kpis">
              <div><span>ห้องทั้งหมด</span><b>{project.totalRooms}</b></div>
              <div><span>มีผู้เช่า</span><b>{project.occupiedRooms}</b></div>
              <div><span>รายได้/เดือน</span><b>฿{project.monthlyRevenue.toLocaleString()}</b></div>
            </div>
            <div className="occupancy-progress-head"><span>อัตราเข้าพัก</span><strong>{occupancyRate}%</strong></div>
            <div className="progress-track"><i style={{ width: `${occupancyRate}%` }} /></div>
            <div className="project-foot"><div><span>ผู้ดูแล</span><strong>{project.manager}</strong></div><Link className="project-detail-btn" href={`/projects/${project.id}`}>ดูโครงการ <Icon name="chevron" size={15}/></Link></div>
          </div>
        </article>;
      })}
    </section>
  </AppShell>;
}
