// === filename: frontend/src/components/layout/Sidebar.jsx ===
import { Activity, AlertTriangle, BarChart3, ChevronLeft, ChevronRight, Clock3, Database, FileText, LayoutDashboard, Network, Router, ShieldAlert } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import Tooltip from '../ui/Tooltip.jsx';
import { useSiemStore } from '../../store.js';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/explorer', label: 'Log explorer', icon: Database },
  { href: '/threats', label: 'Threat map', icon: ShieldAlert },
  { href: '/timeline', label: 'Timeline', icon: Clock3 },
  { href: '/devices', label: 'Devices', icon: Network },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

/** Collapsible sidebar with local collector and listener status. */
export default function Sidebar({ collapsed, onToggle }) {
  const [path] = useLocation();
  const socketStatus = useSiemStore((state) => state.socketStatus);
  const stats = useSiemStore((state) => state.stats);
  const health = useSiemStore((state) => state.health);
  const listenerHealthy = Boolean(health.syslog_listeners?.udp || health.syslog_listeners?.tcp);
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Main navigation">
      <div className="sidebar-section-label">Workspace</div>
      <nav className="sidebar-nav">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Tooltip key={href} label={label} disabled={!collapsed}>
            <Link href={href} className={`sidebar-link ${path === href ? 'active' : ''}`} aria-current={path === href ? 'page' : undefined}>
              <Icon size={17} strokeWidth={1.8} /><span className="nav-label">{label}</span>
              {label === 'Threat map' && stats.anomalies > 0 && <span className="nav-count">{stats.anomalies}</span>}
            </Link>
          </Tooltip>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-section-label">Collection</div>
      <div className="health-card">
        <div className="health-card-title"><Router size={14} /><span className="nav-label">D-Link router</span></div>
        <div className="health-card-row"><span className={`health-dot ${socketStatus === 'connected' ? 'healthy' : 'warning'}`} /><span className="nav-label">{socketStatus === 'connected' ? 'Live stream connected' : 'Waiting for API stream'}</span><Activity size={13} /></div>
        <div className="health-card-row"><span className={`health-dot ${listenerHealthy ? 'healthy' : 'warning'}`} /><span className="nav-label">Syslog {listenerHealthy ? 'listener ready' : health.syslog_enabled ? 'listener unavailable' : 'disabled'}</span><span className="listener-badge">{health.syslog_listeners?.udp ? 'UDP' : health.syslog_listeners?.tcp ? 'TCP' : '—'}</span></div>
        <div className="health-card-foot nav-label">DSL-8251CG1 · 192.168.0.1</div>
      </div>
      <div className="sidebar-session nav-label"><FileText size={13} /> Persistent local database</div>
      <button className="sidebar-collapse" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}<span className="nav-label">Collapse menu</span>
      </button>
    </aside>
  );
}
