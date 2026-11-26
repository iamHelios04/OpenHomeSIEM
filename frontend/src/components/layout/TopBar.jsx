// === filename: frontend/src/components/layout/TopBar.jsx ===
import { useEffect, useState } from 'react';
import { Bell, ChevronDown, Download, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { fetchAllLogs } from '../../api.js';
import { useSiemStore } from '../../store.js';
import Tooltip from '../ui/Tooltip.jsx';

const titles = {
  '/dashboard': 'Command center', '/explorer': 'Log explorer', '/threats': 'Threat map',
  '/timeline': 'Event timeline', '/devices': 'Device inventory', '/alerts': 'Analyst alerts', '/reports': 'Reports',
};

function downloadCsv(rows) {
  const columns = ['id', 'timestamp', 'severity_name', 'pri', 'facility', 'source_ip', 'type', 'process', 'host', 'mac_address', 'lease_ip', 'wan_ip', 'domains', 'message', 'raw', 'source_device'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const body = [columns.join(','), ...rows.map((row) => columns.map((key) => quote(Array.isArray(row[key]) ? row[key].join('; ') : row[key])).join(','))].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8' }));
  link.download = 'openhome-siem-logs.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Fixed top bar with route title, live clock, connection state, notifications, and export. */
export default function TopBar() {
  const [path, setLocation] = useLocation();
  const [now, setNow] = useState(new Date());
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const stats = useSiemStore((state) => state.stats);
  const socketStatus = useSiemStore((state) => state.socketStatus);
  const utc = useSiemStore((state) => state.utcMode);
  const setUtc = useSiemStore((state) => state.setUtcMode);
  const pushToast = useSiemStore((state) => state.pushToast);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const exportLogs = async () => {
    setExporting(true);
    try {
      downloadCsv(await fetchAllLogs({ sort_by: 'timestamp', sort_dir: 'desc' }));
      pushToast('Log export complete');
    } catch (error) {
      pushToast(error.userMessage || 'Log export failed', 'error');
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  };

  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand" aria-label="OpenHomeSIEM dashboard">
        <span className="brand-mark"><ShieldCheck size={17} /></span>
        <span>OPEN<span className="brand-accent">HOME</span>SIEM</span><span className={`brand-live-dot ${socketStatus === 'connected' ? 'connected' : ''}`} aria-label={`Collector ${socketStatus}`} />
      </Link>
      <div className="topbar-page">{titles[path] || 'OpenHomeSIEM'}</div>
      <div className="topbar-actions">
        <label className="utc-control"><input type="checkbox" checked={utc} onChange={(event) => setUtc(event.target.checked)} /> UTC</label>
        <time className="clock" dateTime={now.toISOString()}>{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', ...(utc ? { timeZone: 'UTC', timeZoneName: 'short' } : {}) }).format(now)}</time>
        <Tooltip label={socketStatus === 'connected' ? 'Live collector connection' : 'Collector connection is retrying'}>
          <span className={`socket-indicator ${socketStatus === 'connected' ? 'connected' : 'disconnected'}`} aria-label={`WebSocket ${socketStatus}`} />
        </Tooltip>
        <span className="event-count mono">{Number(stats.total || 0).toLocaleString()} events</span>
        <Tooltip label="Open analyst alerts">
          <button className="icon-action notification-button" aria-label="Open notifications" onClick={() => setLocation('/alerts')}>
            <Bell size={16} />{stats.anomalies > 0 && <span className="notification-count">{stats.anomalies > 99 ? '99+' : stats.anomalies}</span>}
          </button>
        </Tooltip>
        <div className="export-menu-wrap">
          <button className="button button-secondary button-small" onClick={() => setExportOpen((value) => !value)} aria-expanded={exportOpen}>
            <Download size={14} /> Export <ChevronDown size={13} />
          </button>
          {exportOpen && <div className="export-menu"><button onClick={exportLogs} disabled={exporting}>{exporting ? 'Preparing CSV…' : 'Export all logs as CSV'}</button><button onClick={() => { setLocation('/reports'); setExportOpen(false); }}>Open reports</button></div>}
        </div>
      </div>
    </header>
  );
}
