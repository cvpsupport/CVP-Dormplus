import { AppShell } from '@/components/app-shell';
import { Badge, PageTitle, SearchBox, StatCard } from '@/components/ui';
import { Icon } from '@/components/icons';
import { invoices } from '@/lib/mock-data';

export default function BillingPage(){
  return <AppShell>
    <PageTitle title="การเงินและการชำระ" subtitle="ติดตามใบแจ้งหนี้ การรับชำระ และรายรับของหอพัก" action={<button className="primary-btn"><Icon name="plus" size={18}/> สร้างใบแจ้งหนี้</button>}/>
    <section className="stats-grid compact"><StatCard icon="finance" label="รายรับเดือนนี้" value="฿126,500" note="↑ 12%"/><StatCard icon="contract" label="รอชำระ" value="฿32,250" note="8 รายการ" tone="amber"/><StatCard icon="bell" label="เกินกำหนด" value="฿8,640" note="2 รายการ" tone="red"/><StatCard icon="chart" label="อัตราเก็บเงิน" value="93.6%" note="เดือนปัจจุบัน" tone="blue"/></section>
    <div className="toolbar"><SearchBox placeholder="ค้นหาเลขที่บิล ห้อง หรือผู้เช่า..."/></div>
    <section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>เลขที่</th><th>ห้อง</th><th>ผู้เช่า</th><th>ยอดรวม</th><th>ครบกำหนด</th><th>สถานะ</th><th></th></tr></thead><tbody>
    {invoices.map(i=><tr key={i.no}><td><b>{i.no}</b></td><td>{i.room}</td><td>{i.tenant}</td><td><b>฿{i.amount.toLocaleString()}</b></td><td>{i.due}</td><td><Badge tone={i.status==='paid'?'green':i.status==='overdue'?'red':'amber'}>{i.status==='paid'?'ชำระแล้ว':i.status==='overdue'?'เกินกำหนด':'รอชำระ'}</Badge></td><td><button className="link-btn">รายละเอียด</button></td></tr>)}
    </tbody></table></div></section>
  </AppShell>
}
