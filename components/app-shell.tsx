'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';

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
              {href === '/maintenance' && <span className="nav-count">3</span>}
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
          <strong>3 โครงการที่กำลังดูแล</strong>
          <span>116 ห้อง · ผู้เช่า 105 คน</span>
          <div className="sidebar-progress"><i/></div>
          <div className="sidebar-progress-meta"><span>อัตราเข้าพักรวม</span><b>91%</b></div>
          <Link className="sidebar-card-link" href="/projects">จัดการโครงการ <Icon name="chevron" size={14}/></Link>
        </div>
        <div className="sidebar-foot">DormPlus <b>v0.2</b><br/><span>Supabase · Vercel</span></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark"><Icon name="home" size={18}/></div><b>DormPlus</b></div>
          <Link href="/projects" className="project-switcher">
            <span className="project-switcher-kicker">โครงการปัจจุบัน</span>
            <strong>Green Park Residence</strong>
            <span className="project-switcher-status"><i/> ออนไลน์</span>
            <Icon name="chevron" size={15}/>
          </Link>

          <div className="topbar-search">
            <Icon name="search" size={17}/><span>ค้นหาห้อง ผู้เช่า หรือบิล...</span><kbd>⌘ K</kbd>
          </div>

          <div className="top-actions">
            <button className="icon-btn notification-btn" aria-label="notifications"><Icon name="bell"/><i/></button>
            <div className="profile-wrap">
              <div className="avatar">KS</div>
              <div className="profile"><strong>คุณกอบ</strong><span>เจ้าของโครงการ</span></div>
              <Icon name="chevron-down" size={15}/>
            </div>
          </div>
        </header>
        <div className="content">{children}</div>
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
