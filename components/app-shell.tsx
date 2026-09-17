'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './icons';
import { useWorkspace } from '@/lib/workspace';

const nav = [
  ['/dashboard', 'หน้าหลัก', 'home'],
  ['/projects', 'โครงการ', 'project'],
  ['/rooms', 'ห้องพัก', 'rooms'],
  ['/tenants', 'ผู้เช่า', 'users'],
  ['/billing', 'การเงิน', 'finance'],
  ['/maintenance', 'แจ้งซ่อม', 'wrench'],
  ['/settings', 'ตั้งค่า', 'settings']
] as const;

const mobileNav = [
  ['/dashboard', 'หน้าหลัก', 'home'],
  ['/projects', 'โครงการ', 'project'],
  ['/rooms', 'ห้องพัก', 'rooms'],
  ['/billing', 'การเงิน', 'finance'],
  ['/maintenance', 'แจ้งซ่อม', 'wrench']
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = useWorkspace();

  async function logout() {
    try {
      if (workspace.supabase) await workspace.supabase.auth.signOut({ scope: 'local' });
    } finally {
      window.localStorage.removeItem('dormplus.activePropertyId');
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <div className="brand-mark"><Icon name="home" size={20}/></div>
          <div><b>DormPlus</b><span>Property OS for modern dorms</span></div>
        </Link>

        <div className="nav-caption">เมนูหลัก</div>
        <nav className="nav-list">
          {nav.slice(0, 6).map(([href, label, icon]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon"><Icon name={icon} size={18}/></span><span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="nav-caption nav-caption-secondary">ระบบ</div>
        <nav className="nav-list">
          {nav.slice(6).map(([href, label, icon]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon"><Icon name={icon} size={18}/></span><span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-card-top"><span className="live-dot"/><span>Portfolio overview</span></div>
          <strong>{workspace.properties.length} โครงการที่กำลังดูแล</strong>
          <span>{workspace.activeProperty?.name || 'ยังไม่ได้สร้างโครงการ'}</span>
          <div className="sidebar-progress"><i style={{width: workspace.properties.length ? '82%' : '0%'}}/></div>
          <Link className="sidebar-card-link" href="/projects">จัดการโครงการ <Icon name="chevron" size={14}/></Link>
        </div>
        <div className="sidebar-foot">DormPlus <b>v0.3 CRUD</b><br/><span>Supabase · Vercel</span></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark"><Icon name="home" size={18}/></div><b>DormPlus</b></div>
          <div className="project-switcher project-switcher-live">
            <div className="project-switcher-copy">
              <span className="project-switcher-kicker">โครงการปัจจุบัน</span>
              {workspace.loading ? <strong>กำลังโหลด...</strong> : workspace.properties.length ? (
                <select value={workspace.activePropertyId || ''} onChange={e => workspace.setActivePropertyId(e.target.value)}>
                  {workspace.properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : <Link href="/projects"><strong>+ สร้างโครงการแรก</strong></Link>}
            </div>
            <span className="project-switcher-status"><i/> ออนไลน์</span>
          </div>

          <div className="topbar-search">
            <Icon name="search" size={17}/><span>ค้นหาห้อง ผู้เช่า หรือบิล...</span><kbd>⌘ K</kbd>
          </div>

          <div className="top-actions">
            <button className="icon-btn notification-btn" aria-label="notifications"><Icon name="bell"/></button>
            <div className="profile-wrap">
              <div className="avatar">{workspace.userName.slice(0,2).toUpperCase()}</div>
              <div className="profile"><strong>{workspace.userName}</strong><span>ผู้ใช้งานระบบ</span></div>
            </div>
            <button className="logout-action" onClick={logout} title="ออกจากระบบ" aria-label="ออกจากระบบ"><Icon name="logout" size={17}/><span>ออกจากระบบ</span></button>
          </div>
        </header>
        <div className="content">{workspace.error && <div className="connection-alert"><b>เชื่อมต่อ Supabase ไม่สำเร็จ</b><span>{workspace.error}</span></div>}{children}</div>
      </main>

      <nav className="mobile-nav">
        {mobileNav.map(([href, label, icon]) => (
          <Link key={href} href={href} className={pathname.startsWith(href) ? 'mobile-nav-item active' : 'mobile-nav-item'}>
            <span className="mobile-nav-icon"><Icon name={icon} size={19}/></span><span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
