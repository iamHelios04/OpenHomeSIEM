// === filename: frontend/src/pages/Dashboard.jsx ===
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, CloudDownload, Database, FileText, Network, Radio, ShieldAlert, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { buildSampleLogs } from '../sampleLogs.js';
import { useSiemStore } from '../store.js';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import LogMessage from '../components/ui/LogMessage.jsx';
import EventsTimelineChart from '../components/charts/EventsTimelineChart.jsx';
import LogTypeDonutChart from '../components/charts/LogTypeDonutChart.jsx';
import TopDomainsChart from '../components/charts/TopDomainsChart.jsx';
import { Link } from 'wouter';
import { formatClock } from '../utils/time.js';

const typeNames = ['DHCP', 'DNS', 'Kernel', 'Firewall', 'System', 'PPP'];

function buildCharts(rows, hours = [], utcMode = false) {
  const grouped = new Map();
  rows.forEach((row) => {
    const date = new Date(row.timestamp);
    const bucket = utcMode ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())) : new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours());
    const key = bucket.toISOString();
    if (!grouped.has(key)) grouped.set(key, { hour: key, label: formatClock(bucket, utcMode, false), dhcp: 0, dns: 0, kernel: 0, firewall: 0, system: 0, ppp: 0 });
    const record = grouped.get(key);
    const field = String(row.type || 'Other').toLowerCase();
    if (field in record) record[field] += 1;
    else record.system += 1;
  });
  if (!grouped.size && hours.length) {
    hours.forEach((item) => grouped.set(item.hour, { hour: item.hour, label: formatClock(item.hour, utcMode, false), dhcp: 0, dns: 0, kernel: 0, firewall: 0, system: item.count, ppp: 0 }));
  }
  const timeSeries = [...grouped.values()].sort((a, b) => a.hour.localeCompare(b.hour)).slice(-24);
  const typeCounts = new Map();
  rows.forEach((row) => typeCounts.set(row.type, (typeCounts.get(row.type) || 0) + 1));
  const types = [...typeCounts.entries()].map(([name, value]) => ({ name, value }));
  const domainCounts = new Map();
  rows.filter((row) => row.type === 'DNS').forEach((row) => (row.domains || []).forEach((domain) => domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1)));
  const domains = [...domainCounts.entries()].map(([domain, count]) => ({ domain, count, suspicious: /\.(tk|xyz|ru|cn|top|zip|click|gq)$/i.test(domain) })).sort((a, b) => b.count - a.count).slice(0, 10);
  return { timeSeries, types, domains };
}

/** Dashboard summary, charts, recent high-severity events, and ingestion panel. */
export default function Dashboard() {
  const loadDashboard = useSiemStore((state) => state.loadDashboard);
  const loadDevices = useSiemStore((state) => state.loadDevices);
  const stats = useSiemStore((state) => state.stats);
  const logs = useSiemStore((state) => state.logs);
  const loading = useSiemStore((state) => state.loading.dashboard);
  const pushToast = useSiemStore((state) => state.pushToast);
  const utcMode = useSiemStore((state) => state.utcMode);
  const [rows, setRows] = useState([]);
  const [ingestText, setIngestText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parseErrorCount, setParseErrorCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [sourceDevice, setSourceDevice] = useState('router');
  const timer = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    const timerId = window.setTimeout(() => {
      api.logs({ page: 1, page_size: 10000, sort_by: 'timestamp', sort_dir: 'desc' }).then((result) => { if (active) setRows(result.items); }).catch(() => {});
    }, 700);
    return () => { active = false; window.clearTimeout(timerId); };
  }, [stats.total]);

  const chartData = useMemo(() => buildCharts(rows.length ? rows : logs, stats.by_hour, utcMode), [rows, logs, stats.by_hour, utcMode]);
  const recentAlerts = useMemo(() => (rows.length ? rows : logs).filter((row) => Number(row.severity) <= 4).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10), [rows, logs]);
  const refreshData = useCallback(async () => {
    await Promise.all([loadDashboard(), loadDevices()]);
  }, [loadDashboard, loadDevices]);

  const parseLines = useCallback(async (raw) => {
    const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) { pushToast('Paste or drop syslog lines before parsing', 'warning'); return; }
    setParsing(true); setProgress(0); setParseErrorCount(0);
    let parsed = 0; let errors = 0; let anomalies = 0;
    try {
      const batchSize = 2000;
      for (let offset = 0; offset < lines.length; offset += batchSize) {
        const batch = lines.slice(offset, offset + batchSize);
        const response = await api.ingest(batch, sourceDevice, 'router');
        parsed += response.parsed; errors += response.errors; anomalies += response.anomalies_found;
        setProgress(Math.round(Math.min(lines.length, offset + batch.length) / lines.length * 100));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      setParseErrorCount(errors);
      pushToast(`Parsed ${parsed.toLocaleString()} log lines${errors ? ` · ${errors} errors` : ''}`);
      if (anomalies) pushToast(`${anomalies} anomalies detected`, 'warning');
      setIngestText('');
      if (inputRef.current) inputRef.current.value = '';
      await refreshData();
    } catch (error) {
      pushToast(error.userMessage || 'Log ingestion failed', 'error');
    } finally {
      setParsing(false);
      setProgress(100);
    }
  }, [pushToast, refreshData, sourceDevice]);

  const scheduleAutoParse = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => parseLines(inputRef.current?.value || ingestText), 600);
  };

  const loadSample = () => {
    const sample = buildSampleLogs().join('\n');
    setIngestText(sample);
    if (inputRef.current) inputRef.current.value = sample;
    parseLines(sample);
  };

  const handleDrop = async (event) => {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.(log|txt)$/i.test(file.name)) { pushToast('Choose a .log or .txt file', 'warning'); return; }
    try { const text = await file.text(); setIngestText(text); if (inputRef.current) inputRef.current.value = text; await parseLines(text); }
    catch { pushToast('Could not read the dropped file', 'error'); }
  };

  return (
    <div className="page-view">
      <div className="page-heading"><div><div className="eyebrow">Home network · security operations</div><h1>Command center</h1><p>Collect router telemetry, review local detections, and investigate events.</p></div><div className="heading-actions"><span className="last-updated"><Radio size={13} /> Updated {useSiemStore.getState().lastUpdated ? new Date(useSiemStore.getState().lastUpdated).toLocaleTimeString() : '—'}</span></div></div>
      <section className="panel ingest-panel" aria-label="Log ingestion">
        <div className="panel-heading"><div><div className="panel-title"><CloudDownload size={15} /> Log ingestion</div><div className="panel-subtitle">Paste, import, or drop raw syslog from your collector.</div></div><Link href="/explorer" className="text-link">View live events <ArrowUpRight size={13} /></Link></div>
        <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
          <textarea ref={inputRef} defaultValue={ingestText} onChange={(event) => setIngestText(event.target.value)} onPaste={() => window.setTimeout(scheduleAutoParse, 40)} spellCheck="false" aria-label="Paste syslog lines or drop a log file" placeholder={'Paste syslog lines here or drop a .log or .txt file…\n<134>Oct 28 10:42:17 DSL-8251CG1 dnsmasq[1184]: query[A] example.com from 192.168.0.24'} />
          <div className="drop-zone-hint"><FileText size={13} /> Drop .log / .txt · auto-parses after paste</div>
        </div>
        <div className="ingest-controls"><div className="ingest-actions"><button className="button button-primary" onClick={() => parseLines(inputRef.current?.value || ingestText)} disabled={parsing}>{parsing ? <><Spinner size="small" /> Parsing {progress}%</> : 'Parse logs'}</button><button className="button button-secondary" onClick={loadSample} disabled={parsing}><Sparkles size={14} /> Load sample D-Link logs</button><label className="select-inline">Source device<select value={sourceDevice} onChange={(event) => setSourceDevice(event.target.value)}><option value="router">Router</option><option value="switch">Switch</option><option value="firewall">Firewall</option><option value="ids">IDS / IPS</option><option value="windows">Windows host</option><option value="linux">Linux host</option></select></label></div><div className="ingest-status">{parseErrorCount > 0 ? <span className="status-error"><AlertCircle size={13} /> {parseErrorCount} parse errors</span> : <span>{stats.total.toLocaleString()} records stored in database</span>}</div></div>
        {parsing && <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${progress}%` }} /></div>}
      </section>
      {loading && !stats.total && <div className="page-loading"><Spinner label="Loading dashboard" /> Loading dashboard data…</div>}
      <section className="stat-grid" aria-label="Network event metrics">
        <StatCard label="Total Events" value={stats.total} tone="neutral" footnote="Persisted log records" icon={Database} />
        <StatCard label="Critical Alerts" value={stats.critical} tone="red" footnote="Severity 0–3" icon={ShieldAlert} critical />
        <StatCard label="Unique Devices" value={stats.devices} tone="purple" footnote="DHCP / ARP discovered" icon={Network} />
        <StatCard label="DNS Queries" value={stats.dns_queries} tone="cyan" footnote="Resolver activity" icon={ArrowUpRight} />
        <StatCard label="DHCP Leases" value={stats.dhcp_leases} tone="purple" footnote="Acknowledged leases" icon={FileText} />
        <StatCard label="Blocked Connections" value={stats.blocked} tone="red" footnote="Firewall drops / rejects" icon={ShieldAlert} />
      </section>
      {stats.total === 0 && !loading ? <EmptyState title="No events collected yet" description="Load the D-Link sample or configure remote syslog on your router to populate the SOC workspace." action={<button className="button button-secondary" onClick={loadSample}>Load sample D-Link logs</button>} /> : <>
        <section className="dashboard-charts"><article className="panel chart-panel chart-main"><div className="panel-heading"><div><div className="panel-title">Events over time</div><div className="panel-subtitle">Hourly event volume by log family</div></div><span className="mini-tag">LAST 24H</span></div><EventsTimelineChart data={chartData.timeSeries} /></article><article className="panel chart-panel"><div className="panel-heading"><div><div className="panel-title">Log type distribution</div><div className="panel-subtitle">Events grouped by parser type</div></div></div><LogTypeDonutChart data={chartData.types} /></article></section>
        <section className="dashboard-lower"><article className="panel chart-panel"><div className="panel-heading"><div><div className="panel-title">Top queried domains</div><div className="panel-subtitle">Suspicious TLDs are highlighted</div></div><Link href="/explorer" className="text-link">Investigate <ArrowUpRight size={13} /></Link></div><TopDomainsChart data={chartData.domains} /></article><article className="panel alerts-panel"><div className="panel-heading"><div><div className="panel-title">Recent alerts</div><div className="panel-subtitle">Last 10 high-severity log events</div></div><Link href="/explorer" className="text-link">View stream <ArrowUpRight size={13} /></Link></div><div className="recent-alert-list">{recentAlerts.length ? recentAlerts.map((row) => <div key={row.id} className="recent-alert-row"><span className={`severity-dot ${Number(row.severity) <= 3 ? 'critical' : 'warning'}`} /><time className="mono">{formatClock(row.timestamp, utcMode)}</time><Badge type={row.type}>{row.type}</Badge><LogMessage text={row.message} className="recent-alert-message" /></div>) : <div className="empty-inline">No high-severity events in the current data set.</div>}</div></article></section>
      </>}
    </div>
  );
}
