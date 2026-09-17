import { Icon } from '@/components/icons';

export default function LoginPage(){
  return <main className="login-page">
    <section className="login-showcase">
      <div className="login-brand"><div className="brand-mark"><Icon name="home" size={20}/></div><div><b>DormPlus</b><span>Property Management</span></div></div>
      <div className="login-showcase-copy"><span className="hero-kicker"><Icon name="sparkles" size={15}/> ระบบบริหารหอพักยุคใหม่</span><h2>บริหารทุกโครงการ<br/>จากหน้าจอเดียว</h2><p>ห้องพัก ผู้เช่า การเงิน และงานซ่อม เชื่อมอยู่ในระบบเดียว พร้อมขยายด้วย Supabase + Vercel</p></div>
      <div className="login-feature-row"><div><Icon name="shield"/><span><b>Secure</b>Row Level Security</span></div><div><Icon name="chart"/><span><b>Realtime</b>เห็นภาพรวมทันที</span></div><div><Icon name="project"/><span><b>Multi-project</b>รองรับหลายโครงการ</span></div></div>
      <div className="login-orb login-orb-a"/><div className="login-orb login-orb-b"/>
    </section>
    <section className="login-form-wrap"><div className="login-card"><div className="login-mobile-logo"><div className="brand-mark"><Icon name="home" size={18}/></div><b>DormPlus</b></div><span className="login-eyebrow">WELCOME BACK</span><h1>เข้าสู่ระบบ</h1><p>จัดการหอพักของคุณต่อจากที่ค้างไว้</p><form><label>อีเมล<input type="email" placeholder="owner@example.com"/></label><label>รหัสผ่าน<input type="password" placeholder="••••••••"/></label><div className="login-options"><label className="remember"><input type="checkbox"/> จดจำฉัน</label><a href="#">ลืมรหัสผ่าน?</a></div><a href="/dashboard" className="primary-btn login-btn">เข้าสู่ระบบ <Icon name="chevron" size={16}/></a></form><div className="login-separator"><span>Prototype mode</span></div><small>เชื่อม Supabase Auth ได้ทันทีเมื่อกำหนด Environment Variables</small></div></section>
  </main>
}
