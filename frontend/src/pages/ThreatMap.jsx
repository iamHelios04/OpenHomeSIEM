// === filename: frontend/src/pages/ThreatMap.jsx ===
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import { api } from '../api.js';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useSiemStore } from '../store.js';
import { formatDateTime } from '../utils/time.js';

const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** Investigation feed with resolve actions and an SVG LAN map. */
export default function ThreatMap() {
  const [, setLocation] = useLocation();
  const loadAnomalies = useSiemStore((state) => state.loadAnomalies);
  const loadDevices = useSiemStore((state) => state.loadDevices);
  const anomalies = useSiemStore((state) => state.anomalies);
  const devices = useSiemStore((state) => state.devices);
  const pushToast = useSiemStore((state) => state.pushToast);
  const utcMode = useSiemStore((state) => state.utcMode);
  const [resolvedFilter, setResolvedFilter] = useState('unresolved');
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadDevices(); }, [loadDevices]);
  useEffect(() => {
    setLoading(true);
    loadAnomalies(resolvedFilter === 'all' ? {} : { resolved: resolvedFilter === 'resolved' }).finally(() => setLoading(false));
  }, [loadAnomalies, resolvedFilter]);

  const visible = useMemo(() => {
    const rows = [...anomalies].filter((item) => resolvedFilter === 'all' || item.resolved === (resolvedFilter === 'resolved'));
    return rows.sort((a, b) => sortBy === 'severity' ? (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) : new Date(b.detected_at) - new Date(a.detected_at));
  }, [anomalies, resolvedFilter, sortBy]);

  const openDevice = (device) => {
    const filter = device.ip_address ? { field: 'source_ip', value: device.ip_address } : { field: 'search', value: device.mac_address || '' };
    useSiemStore.getState().queueLogFilter(filter);
    setLocation('/explorer');
  };

  const resolve = async (anomaly) => {
    try {
      await api.updateAnomaly(anomaly.id, { resolved: !anomaly.resolved });
      await loadAnomalies(resolvedFilter === 'all' ? {} : { resolved: resolvedFilter === 'resolved' });
      pushToast(anomaly.resolved ? 'Detection reopened' : 'Detection resolved');
    } catch (error) { pushToast(error.userMessage || 'Could not update detection', 'error'); }
  };

  const width = 620; const height = 420; const centerX = width / 2; const routerY = 52;
  const mapDevices = devices.slice(0, 16);
  const flaggedIps = new Set(anomalies.filter((item) => !item.resolved).map((item) => item.source_ip).filter(Boolean));
  const nodes = mapDevices.map((device, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / Math.max(mapDevices.length, 1));
    return { device, x: centerX + Math.cos(angle) * 230, y: 225 + Math.sin(angle) * 122, flagged: flaggedIps.has(device.ip_address), index };
  });

  return (
    <div className="page-view">
      <div className="page-heading"><div><div className="eyebrow">Behavioral detections · local intelligence</div><h1>Threat map</h1><p>Rule-based patterns from imported events. No external IP or reputation service is queried.</p></div><button className="button button-secondary" onClick={() => { loadAnomalies(); loadDevices(); }}><RefreshCw size={14} /> Refresh detections</button></div>
      <div className="threat-layout">
        <section className="panel threat-feed"><div className="panel-heading"><div><div className="panel-title">Suspicious activity feed <span className="count-muted">{visible.length}</span></div><div className="panel-subtitle">Port scans, DNS indicators, DHCP storms, and more</div></div><div className="feed-controls"><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort detections"><option value="newest">Newest first</option><option value="severity">Severity</option></select><select value={resolvedFilter} onChange={(event) => setResolvedFilter(event.target.value)} aria-label="Filter detections"><option value="unresolved">Unresolved</option><option value="resolved">Resolved</option><option value="all">All detections</option></select></div></div>
        {loading && !visible.length ? <div className="loading-inline"><Spinner label="Loading detections" /> Loading detections…</div> : visible.length === 0 ? <EmptyState title="No matching detections" description="The current data set has no detections for this filter." /> : <div className="anomaly-list">{visible.map((item) => <article className={`anomaly-card anomaly-${item.severity} ${item.resolved ? 'resolved' : ''}`} key={item.id}><div className="anomaly-head"><div><Badge severity={item.severity}>{item.severity}</Badge><span className="anomaly-title">{item.title}</span></div><span className={`status-tag ${item.resolved ? 'status-gone' : 'status-open'}`}>{item.resolved ? 'Resolved' : 'Open'}</span></div><p className="anomaly-description">{item.description}</p><div className="anomaly-meta"><span>{item.evidence_ids?.length || 0} evidence lines</span><time>{formatDateTime(item.detected_at, utcMode, true)}</time>{item.source_ip && <button className="indicator-link mono" onClick={() => { useSiemStore.getState().queueLogFilter({ field: 'source_ip', value: item.source_ip }); setLocation('/explorer'); }}>Source · {item.source_ip}</button>}</div>{item.notes && <div className="anomaly-notes">Analyst note: {item.notes}</div>}<div className="anomaly-recommendation"><strong>Recommended action</strong><span>{item.rule_id === 'PORT_SCAN' ? 'Keep unsolicited WAN traffic blocked and review exposed services.' : item.rule_id === 'NEW_DEVICE' ? 'Confirm that this device belongs on the home network.' : item.rule_id === 'DNS_SUSPICIOUS' ? 'Verify the requesting application and consider blocking the domain at the router.' : 'Review the linked log evidence and validate this activity with the device owner.'}</span></div><div className="anomaly-actions"><button className="button button-tertiary button-small" onClick={() => { useSiemStore.getState().queueLogFilter({ field: 'search', value: item.source_ip || item.title }); setLocation('/explorer'); }}><ExternalLink size={13} /> Investigate</button><button className="button button-secondary button-small" onClick={() => resolve(item)}><ShieldCheck size={13} /> {item.resolved ? 'Reopen' : 'Resolve'}</button></div></article>)}</div>}
        </section>
        <section className="panel network-panel"><div className="panel-heading"><div><div className="panel-title">Internal network map</div><div className="panel-subtitle">Select a device node to open its event stream</div></div><span className="mini-tag">LAN</span></div><div className="network-map-wrap"><svg className="network-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Router connected to ${mapDevices.length} discovered devices`}><defs><linearGradient id="router-fill" x1="0" x2="1"><stop stopColor="#142a3c" /><stop offset="1" stopColor="#1c2333" /></linearGradient></defs>{nodes.map(({ device, x, y, flagged }) => <line key={`line-${device.id}`} x1={centerX} y1={routerY + 22} x2={x} y2={y} stroke="#34414d" strokeDasharray="4 5" />)}<g><rect x={centerX - 82} y={routerY - 24} width="164" height="50" rx="9" fill="url(#router-fill)" stroke="#347bb1" /><circle cx={centerX - 62} cy={routerY + 1} r="4" fill="#39d5ff" /><text x={centerX + 5} y={routerY - 1} textAnchor="middle" fill="#e6edf3" fontSize="11" fontWeight="600">D-Link Router</text><text x={centerX + 5} y={routerY + 13} textAnchor="middle" fill="#8ea5bb" fontSize="9" fontFamily="JetBrains Mono">192.168.0.1</text></g>{nodes.map(({ device, x, y, flagged }) => <g key={device.id} role="button" tabIndex="0" aria-label={`Filter events for ${device.ip_address || device.mac_address}`} onClick={() => openDevice(device)} onKeyDown={(event) => { if (event.key === 'Enter') openDevice(device); }} className={`network-node ${flagged ? 'node-flagged' : ''}`} style={{ cursor: 'pointer' }}><circle cx={x} cy={y} r="17" fill="#14202a" stroke={flagged ? '#f85149' : device.status === 'Gone' ? '#77818c' : '#3fb950'} strokeWidth="1.6" /><circle cx={x} cy={y} r="4" fill={flagged ? '#f85149' : device.status === 'Gone' ? '#77818c' : '#3fb950'} /><text x={x} y={y + 31} textAnchor="middle" fill="#c8d2dc" fontSize="9" fontFamily="JetBrains Mono">{device.ip_address || device.mac_address || 'unknown'}</text><text x={x} y={y + 44} textAnchor="middle" fill="#81909e" fontSize="8">{(device.hostname || device.status || 'device').slice(0, 19)}</text></g>)}</svg>{!mapDevices.length && <div className="network-empty">Devices will appear as DHCP and ARP logs are received.</div>}</div><div className="network-legend"><span><i className="legend-dot" />Normal</span><span><i className="legend-dot legend-red" />Active anomaly</span><span><i className="legend-dot legend-gray" />Gone</span></div></section>
      </div>
    </div>
  );
}
