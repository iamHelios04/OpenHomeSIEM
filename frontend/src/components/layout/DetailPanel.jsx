// === filename: frontend/src/components/layout/DetailPanel.jsx ===
import { useEffect } from 'react';
import { Copy, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useSiemStore } from '../../store.js';
import Badge from '../ui/Badge.jsx';
import { formatDateTime } from '../../utils/time.js';

function queueFilter(kind, value) {
  useSiemStore.getState().queueLogFilter({ field: kind, value });
}

/** Accessible right-side full-record inspector. */
export default function DetailPanel() {
  const [, setLocation] = useLocation();
  const record = useSiemStore((state) => state.selectedRecord);
  const setSelectedRecord = useSiemStore((state) => state.setSelectedRecord);
  const pushToast = useSiemStore((state) => state.pushToast);
  const utcMode = useSiemStore((state) => state.utcMode);
  const open = Boolean(record);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && record) setSelectedRecord(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [record, setSelectedRecord]);

  if (!open) return null;
  const copyRaw = async () => {
    try {
      await navigator.clipboard.writeText(record.raw);
      pushToast('Raw log line copied');
    } catch {
      pushToast('Clipboard access is unavailable', 'error');
    }
  };
  const fields = [
    ['PRI', record.pri ?? 'Not present'], ['Facility', record.facility || 'Not present'],
    ['Severity', `${record.severity_name || 'Unknown'} (${record.severity ?? '—'})`], ['Timestamp', `${formatDateTime(record.timestamp, utcMode, true)} ${utcMode ? 'UTC' : 'local'}`],
    ['Host', record.host || 'Not extracted'], ['Process', record.process || 'Not extracted'], ['PID', record.pid || 'Not present'],
    ['Type', record.type], ['Source IP', record.source_ip || 'Not extracted'], ['MAC', record.mac_address || 'Not extracted'],
    ['Lease IP', record.lease_ip || 'Not extracted'], ['WAN IP', record.wan_ip || 'Not extracted'], ['Hostname', record.client_hostname || 'Not extracted'],
    ['Destination port', record.dst_port || 'Not extracted'], ['Protocol', record.protocol || 'Not extracted'], ['Message', record.message],
  ];
  return (
    <>
      <button className="detail-overlay" aria-label="Close event details" onClick={() => setSelectedRecord(null)} />
      <aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="detail-head"><div><div className="eyebrow">Event detail · #{record.id}</div><h2 id="detail-title">{record.type} event</h2><div className="detail-head-meta"><Badge severity={record.severity_group}>{record.severity_name}</Badge><span className="mono">{new Date(record.timestamp).toLocaleString()}</span></div></div><button className="icon-action" onClick={() => setSelectedRecord(null)} aria-label="Close event details"><X size={17} /></button></div>
        <div className="detail-body">
          <section className="detail-section"><div className="detail-section-title">Full raw log line <button className="text-button" onClick={copyRaw}><Copy size={13} /> Copy raw</button></div><pre className="raw-line">{record.raw}</pre></section>
          <section className="detail-section"><div className="detail-section-title">Parsed fields</div><dl className="detail-fields">{fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd className={['PRI', 'PID', 'Source IP', 'MAC', 'Lease IP'].includes(key) ? 'mono' : ''}>{value}</dd></div>)}</dl></section>
          <section className="detail-section"><div className="detail-section-title">Extracted indicators</div><div className="indicator-list">{(record.ips || []).map((ip) => <button key={ip} onClick={() => { queueFilter('source_ip', ip); setLocation('/explorer'); setSelectedRecord(null); }} className="indicator-chip mono">IP · {ip}</button>)}{(record.domains || []).map((domain) => <button key={domain} onClick={() => { queueFilter('domain', domain); setLocation('/explorer'); setSelectedRecord(null); }} className="indicator-chip mono">{domain}</button>)}{record.mac_address && <button onClick={() => { queueFilter('search', record.mac_address); setLocation('/explorer'); setSelectedRecord(null); }} className="indicator-chip mono">MAC · {record.mac_address}</button>}{record.process && <button onClick={() => { queueFilter('process', record.process); setLocation('/explorer'); setSelectedRecord(null); }} className="indicator-chip mono">Process · {record.process}</button>}{(!record.ips?.length && !record.domains?.length && !record.mac_address) && <span className="muted">No IP addresses or domains were extracted.</span>}</div></section>
        </div>
      </aside>
    </>
  );
}
