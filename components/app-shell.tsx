'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './icons';
import { useWorkspace } from '@/lib/workspace';

type NavItem = readonly [string, string, string, string];

const mainNav: NavItem[] = [
  ['/dashboard', 'หน้าหลัก', 'home', 'dashboard.view'],
  ['/projects', 'โครงการ', 'project', 'projects.view'],
  ['/rooms', 'ห้องพัก', 'rooms', 'rooms.view'],
  ['/tenants', 'ผู้เช่า', 'users', 'tenants.view'],
  ['/meters', 'มิเตอร์น้ำ / ไฟ', 'meter', 'meters.view'],
  ['/billing-periods', 'รอบบิล', 'calendar', 'periods.view'],
  ['/billing', 'ใบแจ้งหนี้', 'finance', 'billing.view'],
  ['/payments', 'รับชำระ / ใบเสร็จ', 'receipt', 'payments.view'],
  ['/deposits', 'เงินประกัน', 'shield', 'deposits.view'],
  ['/checkouts', 'ย้ายออก / Check-out', 'logout', 'checkout.view'],
  ['/expenses', 'ค่าใช้จ่าย', 'finance', 'expenses.view'],
  ['/maintenance', 'แจ้งซ่อม', 'wrench', 'maintenance.view'],
  ['/reports', 'รายงาน', 'chart', 'reports.view'],
  ['/documents', 'เอกสาร', 'contract', 'documents.view'],
];

const systemNav: NavItem[] = [
  ['/notifications', 'แจ้งเตือน', 'bell', 'notifications.view'],
  ['/users', 'ผู้ใช้ / Role / สิทธิ์', 'shield', 'users.view'],
  ['/audit', 'Audit Log', 'clock', 'audit.view'],
  ['/data-tools', 'นำเข้า / ส่งออก', 'refresh', 'data.view'],
  ['/portal', 'Tenant Portal', 'users', 'portal.view'],
  ['/backup', 'Backup / Restore', 'refresh', 'backup.view'],
  ['/settings', 'ตั้งค่า', 'settings', 'settings.view'],
];

const mobileNav: NavItem[] = [
  ['/dashboard', 'หน้าหลัก', 'home', 'dashboard.view'],
  ['/projects', 'โครงการ', 'project', 'projects.view'],
  ['/rooms', 'ห้อง', 'rooms', 'rooms.view'],
  ['/meters', 'มิเตอร์', 'meter', 'meters.view'],
  ['/billing-periods', 'รอบบิล', 'calendar', 'periods.view'],
  ['/payments', 'รับเงิน', 'receipt', 'payments.view'],
  ['/maintenance', 'ซ่อม', 'wrench', 'maintenance.view'],
  ['/users', 'สิทธิ์', 'shield', 'users.view'],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = useWorkspace();
  const [unread,setUnread]=useState(0);

  useEffect(()=>{
    async function loadUnread(){
      if(!workspace.supabase||!workspace.activePropertyId||!workspace.can('notifications.view')){setUnread(0);return;}
      const {count}=await workspace.supabase.from('notifications').select('id',{count:'exact',head:true}).eq('property_id',workspace.activePropertyId).is('read_at',null);
      setUnread(count||0);
    }
    void loadUnread();
  },[workspace.activePropertyId,workspace.supabase,pathname,workspace.permissions]);

  async function logout() {
    try {
      if (workspace.supabase) await workspace.supabase.auth.signOut({ scope: 'local' });
    } finally {
      window.localStorage.removeItem('dormplus.activePropertyId');
      router.replace('/login');
      router.refresh();
    }
  }

  const allowedMain = mainNav.filter(item => workspace.loading || workspace.accessLoading || workspace.can(item[3]));
  const allowedSystem = systemNav.filter(item => workspace.loading || workspace.accessLoading || workspace.can(item[3]));
  const allowedMobile = mobileNav.filter(item => workspace.loading || workspace.accessLoading || workspace.can(item[3]));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <div className="brand-mark"><Icon name="home" size={20}/></div>
          <div><b>DormPlus</b><span>Property OS for modern dorms</span></div>
        </Link>

        <div className="nav-caption">เมนูหลัก</div>
        <nav className="nav-list">
          {allowedMain.map(([href, label, icon]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon"><Icon name={icon} size={18}/></span><span>{label}</span>{href==='/meters'&&<span className="nav-new">ใหม่</span>}
            </Link>
          ))}
        </nav>

        <div className="nav-caption nav-caption-secondary">ระบบ</div>
        <nav className="nav-list">
          {allowedSystem.map(([href, label, icon]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon"><Icon name={icon} size={18}/></span><span>{label}</span>{href==='/notifications'&&unread>0&&<span className="nav-count">{unread>99?'99+':unread}</span>}
            </Link>
          ))}
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-card-top"><span className="live-dot"/><span>Portfolio overview</span></div>
          <strong>{workspace.properties.length} โครงการที่กำลังดูแล</strong>
          <span>{workspace.activeProperty?.name || 'ยังไม่ได้สร้างโครงการ'}</span>
          <div className="sidebar-progress"><i style={{width: workspace.properties.length ? '82%' : '0%'}}/></div>
          {workspace.can('projects.view') && <Link className="sidebar-card-link" href="/projects">จัดการโครงการ <Icon name="chevron" size={14}/></Link>}
        </div>
        <div className="sidebar-foot">DormPlus <b>v0.12 Backup Center</b><br/><span>Supabase · Vercel</span></div>
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
            {workspace.can('notifications.view') && <Link href="/notifications" className="icon-btn notification-btn" aria-label="notifications"><Icon name="bell"/>{unread>0&&<i/>}</Link>}
            <div className="profile-wrap">
              <div className="avatar">{workspace.userName.slice(0,2).toUpperCase()}</div>
              <div className="profile"><strong>{workspace.userName}</strong><span>{workspace.roleName}</span></div>
            </div>
            <button className="logout-action" onClick={logout} title="ออกจากระบบ" aria-label="ออกจากระบบ"><Icon name="logout" size={17}/><span>ออกจากระบบ</span></button>
          </div>
        </header>
        <div className="content">{workspace.error && <div className="connection-alert"><b>เชื่อมต่อ Supabase ไม่สำเร็จ</b><span>{workspace.error}</span></div>}{children}</div>
      </main>

      <nav className="mobile-nav meter-mobile-nav">
        {allowedMobile.map(([href, label, icon]) => (
          <Link key={href} href={href} className={pathname.startsWith(href) ? 'mobile-nav-item active' : 'mobile-nav-item'}>
            <span className="mobile-nav-icon"><Icon name={icon} size={19}/></span><span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
