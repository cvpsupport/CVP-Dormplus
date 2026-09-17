import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, SearchBox } from '@/components/ui';
import { Icon } from '@/components/icons';
import { tenants } from '@/lib/mock-data';

export default function TenantsPage(){
  return <AppShell>
    <PageTitle title="ผู้เช่า" subtitle="จัดการข้อมูลผู้เช่า สัญญา และสถานะการเข้าพัก" action={<button className="primary-btn"><Icon name="plus" size={18}/> เพิ่มผู้เช่า</button>}/>
    <div className="toolbar"><SearchBox placeholder="ค้นหาชื่อ เบอร์โทร หรือห้อง..."/></div>
    <section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>ผู้เช่า</th><th>ห้อง</th><th>เบอร์โทร</th><th>สัญญาสิ้นสุด</th><th>สถานะ</th><th></th></tr></thead><tbody>
    {tenants.map((t,i)=><tr key={t.name}><td><div className="person-cell"><div className="avatar">{t.name[0]}</div><div><b>{t.name}</b><span>TEN-00{i+1}</span></div></div></td><td><b>{t.room}</b></td><td>{t.phone}</td><td>{t.contractEnd}</td><td><Badge tone={t.status==='ค้างชำระ'?'red':t.status==='รอย้ายเข้า'?'blue':'green'}>{t.status}</Badge></td><td><button className="link-btn">ดูข้อมูล</button></td></tr>)}
    </tbody></table></div></section>
  </AppShell>
}
