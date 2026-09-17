import { AppShell } from '@/components/app-shell';
import { PageTitle } from '@/components/ui';

export default function SettingsPage(){
  return <AppShell>
    <PageTitle title="ตั้งค่าหอพัก" subtitle="ข้อมูลทั่วไป รอบบิล อัตราค่าน้ำ-ไฟ และการแจ้งเตือน"/>
    <div className="settings-grid">
      <section className="panel form-panel"><h3>ข้อมูลหอพัก</h3><div className="form-grid"><label>ชื่อหอพัก<input defaultValue="DormPlus Residence"/></label><label>เบอร์โทร<input defaultValue="02-xxx-xxxx"/></label><label className="full">ที่อยู่<input defaultValue="กรุงเทพมหานคร ประเทศไทย"/></label></div></section>
      <section className="panel form-panel"><h3>รอบบิล</h3><div className="form-grid"><label>วันที่ออกบิล<input type="number" defaultValue="25"/></label><label>วันครบกำหนด<input type="number" defaultValue="5"/></label><label>ค่าไฟ / หน่วย<input type="number" defaultValue="8"/></label><label>ค่าน้ำ / หน่วย<input type="number" defaultValue="20"/></label></div><button className="primary-btn">บันทึกการตั้งค่า</button></section>
    </div>
  </AppShell>
}
