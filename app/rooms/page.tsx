import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, SearchBox } from '@/components/ui';
import { Icon } from '@/components/icons';
import { rooms } from '@/lib/mock-data';

const label: Record<string,string> = {occupied:'มีผู้เช่า',vacant:'ว่าง',reserved:'จองแล้ว',maintenance:'ซ่อมบำรุง'};
const tone: Record<string,string> = {occupied:'green',vacant:'gray',reserved:'blue',maintenance:'red'};

export default function RoomsPage(){
  return <AppShell>
    <PageTitle title="จัดการห้องพัก" subtitle="ดูสถานะ ราคา และข้อมูลผู้เช่าของแต่ละห้อง" action={<button className="primary-btn"><Icon name="plus" size={18}/> เพิ่มห้อง</button>}/>
    <div className="toolbar"><SearchBox placeholder="ค้นหาห้อง, ผู้เช่า..."/><div className="filter-pills"><button className="active">ทั้งหมด 48</button><button>มีผู้เช่า 42</button><button>ว่าง 6</button></div></div>
    <div className="rooms-grid">{rooms.map((r,i)=><article className="room-card" key={r.id}>
      <div className={`room-photo room-style-${i%3}`}>
        <Badge tone={tone[r.status]}>{label[r.status]}</Badge>
        <div className="room-scene" aria-hidden="true">
          <div className="scene-window"><i/><i/></div>
          <div className="scene-bed"><i/><span/></div>
          <div className="scene-table"/>
          <div className="scene-plant"><i/><i/><i/></div>
        </div>
        <div className="room-number-watermark">{r.name.replace('ห้อง ','')}</div>
      </div>
      <div className="room-body"><div><div><span className="room-kicker">STANDARD ROOM</span><h3>{r.name}</h3></div><strong>฿ {r.rent.toLocaleString()} <small>/ เดือน</small></strong></div><p>{r.tenant}</p><div className="room-meta"><span>ชั้น 1</span><span>28 ตร.ม.</span><span>1 เตียง</span></div><button className="outline-btn">ดูรายละเอียด <Icon name="chevron" size={16}/></button></div>
    </article>)}</div>
  </AppShell>;
}
