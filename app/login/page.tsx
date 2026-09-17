'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage(){
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<'login'|'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) { setMessage('ยังไม่ได้ตั้งค่า Supabase Environment Variables'); return; }
    setLoading(true); setMessage(null);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else router.replace('/dashboard');
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      if (error) setMessage(error.message);
      else if (data.session) router.replace('/projects');
      else setMessage('สร้างบัญชีแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ');
    }
    setLoading(false);
  }

  return <main className="login-page">
    <section className="login-showcase">
      <div className="login-brand"><div className="brand-mark"><Icon name="home" size={20}/></div><div><b>DormPlus</b><span>Property Management</span></div></div>
      <div className="login-showcase-copy"><span className="hero-kicker"><Icon name="sparkles" size={15}/> ระบบบริหารหอพักยุคใหม่</span><h2>บริหารทุกโครงการ<br/>จากหน้าจอเดียว</h2><p>ห้องพัก ผู้เช่า การเงิน และงานซ่อม เชื่อมอยู่ในระบบเดียวบน Supabase + Vercel</p></div>
      <div className="login-feature-row"><div><Icon name="shield"/><span><b>Secure</b>Row Level Security</span></div><div><Icon name="chart"/><span><b>Realtime</b>ข้อมูลจริงจากฐานข้อมูล</span></div><div><Icon name="project"/><span><b>CRUD</b>เพิ่ม แก้ไข ลบได้จริง</span></div></div>
      <div className="login-orb login-orb-a"/><div className="login-orb login-orb-b"/>
    </section>
    <section className="login-form-wrap"><div className="login-card">
      <div className="login-mobile-logo"><div className="brand-mark"><Icon name="home" size={18}/></div><b>DormPlus</b></div>
      <span className="login-eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</span>
      <h1>{mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}</h1>
      <p>{mode === 'login' ? 'เข้าสู่ระบบเพื่อจัดการข้อมูลจริงใน Supabase' : 'สร้างบัญชีเจ้าของโครงการเพื่อเริ่มใช้งาน'}</p>
      <form onSubmit={submit}>
        {mode === 'signup' && <label>ชื่อ<input value={name} onChange={e=>setName(e.target.value)} required placeholder="ชื่อผู้ใช้งาน"/></label>}
        <label>อีเมล<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="owner@example.com"/></label>
        <label>รหัสผ่าน<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required placeholder="••••••••"/></label>
        {message && <div className="auth-message">{message}</div>}
        <button type="submit" className="primary-btn login-btn" disabled={loading}>{loading ? 'กำลังดำเนินการ...' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'} <Icon name="chevron" size={16}/></button>
      </form>
      <div className="login-separator"><span>หรือ</span></div>
      <button className="text-switch" onClick={()=>{setMode(mode==='login'?'signup':'login');setMessage(null);}}>{mode === 'login' ? 'ยังไม่มีบัญชี? สร้างบัญชีใหม่' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}</button>
    </div></section>
  </main>
}
