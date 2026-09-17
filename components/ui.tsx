import { Icon } from './icons';

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return <div className="page-title">
    <div className="page-title-copy"><span className="eyebrow"><i/> WORKSPACE</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {action && <div className="page-title-action">{action}</div>}
  </div>;
}

export function StatCard({ icon, label, value, note, tone = 'green' }: { icon: string; label: string; value: string; note?: string; tone?: string }) {
  return <div className={`stat-card ${tone}`}>
    <div className="stat-card-top"><div className="stat-icon"><Icon name={icon}/></div><span className="stat-more">•••</span></div>
    <div className="stat-card-copy"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
  </div>;
}

export function Badge({ children, tone = 'green' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}><i/>{children}</span>;
}

export function SearchBox({ placeholder = 'ค้นหา...' }: { placeholder?: string }) {
  return <div className="search-box"><Icon name="search" size={17}/><input placeholder={placeholder}/><kbd>⌘K</kbd></div>;
}
