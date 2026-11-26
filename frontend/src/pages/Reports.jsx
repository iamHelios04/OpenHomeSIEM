// === filename: frontend/src/pages/Reports.jsx ===
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Clipboard, Printer, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import EventsTimelineChart from '../components/charts/EventsTimelineChart.jsx';
import { formatDateTime } from '../utils/time.js';
import { useSiemStore } from '../store.js';

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function printDocument(report, utcMode = false) {
  const metricRows = [['Total events', report.total], ['Critical events', report.critical], ['Warnings', report.warning], ['Devices observed', report.devices], ['Anomalies detected', report.anomaly_count], ['DNS query events', report.dns_queries], ['Firewall blocks', report.blocked]];
  const rows = (items, firstKey, secondKey) => (items || []).map((item) => `<tr><td>${escapeHtml(item[firstKey])}</td><td>${escapeHtml(item[secondKey])}</td></tr>`).join('');
  const types = Object.entries(report.by_type || {}).map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(count)}</td></tr>`).join('');
  const hourly = (report.by_hour || []).slice(-24);
  const maxHour = Math.max(1, ...hourly.map((item) => Number(item.count) || 0));
  const timeline = hourly.map((item) => `<div title="${escapeHtml(item.hour)} · ${escapeHtml(item.count)} events" style="height:${Math.max(3, Math.round((Number(item.count) || 0) / maxHour * 110))}px;flex:1;background:#2f81f7;border-radius:3px 3px 0 0;min-width:4px"></div>`).join('');
  const anomalies = (report.anomalies || []).map((item) => `<li><strong>${escapeHtml(item.severity.toUpperCase())} · ${escapeHtml(item.title)}</strong> — ${escapeHtml(item.description)} <small>${escapeHtml(formatDateTime(item.detected_at, utcMode, true))}${utcMode ? ' UTC' : ' local'}</small></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>OpenHomeSIEM Summary</title><style>body{font:14px/1.5 Arial,sans-serif;color:#18212b;max-width:920px;margin:30px auto;padding:0 24px}h1{font-size:25px;margin-bottom:3px}h2{font-size:16px;border-bottom:1px solid #ccd5de;padding-bottom:6px;margin-top:24px}.meta{color:#5d6b78;font-size:11px}table{width:100%;border-collapse:collapse}td,th{padding:7px 9px;border:1px solid #dce2e7;text-align:left}th{background:#f2f5f7}li{margin:8px 0}.toolbar{position:fixed;right:16px;top:12px}.timeline-bars{display:flex;align-items:end;gap:3px;height:130px;padding:8px 8px 23px;border-bottom:1px solid #9aa8b3;background:#f7f9fa}.timeline-bars small{position:absolute;margin-top:132px;color:#687580;font-size:8px}@media print{.toolbar{display:none}body{margin:0;max-width:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div><h1>OpenHomeSIEM · Network Security Summary</h1><div class="meta">Generated ${escapeHtml(new Date(report.generated_at).toLocaleString())} · local collector analysis</div><h2>Summary</h2><table><tbody>${metricRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table><h2>Top talkers</h2><table><thead><tr><th>Source IP</th><th>Events</th></tr></thead><tbody>${rows(report.top_talkers, 'ip', 'count') || '<tr><td colspan="2">No source IPs extracted.</td></tr>'}</tbody></table><h2>Top queried domains</h2><table><thead><tr><th>Domain</th><th>Queries</th></tr></thead><tbody>${rows(report.top_domains, 'domain', 'count') || '<tr><td colspan="2">No DNS domains extracted.</td></tr>'}</tbody></table><h2>Event volume by type</h2><table><thead><tr><th>Type</th><th>Events</th></tr></thead><tbody>${types}</tbody></table><h2>Event timeline · hourly volume</h2><div class="timeline-bars">${timeline || '<span>No hourly events in the report window.</span>'}</div><h2>Detected anomalies</h2><ul>${anomalies || '<li>No anomalies detected.</li>'}</ul><p class="meta">Pattern detections are heuristic and should be validated against expected home-network activity.</p></body></html>`;
}

/** Local summary, talkers, domains, anomalies, PDF and Markdown exports. */
export default function Reports() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const pushToast = useSiemStore((state) => state.pushToast);
  const utcMode = useSiemStore((state) => state.utcMode);

  const loadReport = async () => {
    setLoading(true); setError('');
    try { setReport(await api.report()); }
    catch (failure) { setError(failure.userMessage || 'Could not load report summary'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadReport(); }, []);

  const downloadPdf = async () => {
    setExporting(true);
    const popup = window.open('about:blank', '_blank');
    if (!popup) { setExporting(false); pushToast('Allow pop-ups to print the report', 'warning'); return; }
    try {
      const freshReport = await api.report();
      setReport(freshReport);
      popup.document.open(); popup.document.write(printDocument(freshReport, utcMode)); popup.document.close();
      popup.focus(); popup.print();
      pushToast('Printable report opened');
    } catch (failure) { popup.close(); pushToast(failure.userMessage || 'PDF export failed', 'error'); }
    finally { setExporting(false); }
  };

  const copyMarkdown = async () => {
    if (!report) return;
    const lines = [
      '# OpenHomeSIEM Summary', '', `Generated: ${formatDateTime(report.generated_at, utcMode, true)} ${utcMode ? 'UTC' : 'local'}`, '', '## Summary',
      `- Total events: ${report.total}`, `- Critical events: ${report.critical}`, `- Warning events: ${report.warning}`,
      `- Devices: ${report.devices}`, `- Anomalies detected: ${report.anomaly_count}`, `- DNS events: ${report.dns_queries}`, `- Firewall blocks: ${report.blocked}`, '', '## Top talkers',
      ...(report.top_talkers || []).map((item) => `- ${item.ip}: ${item.count} events`), '', '## Top domains',
      ...(report.top_domains || []).map((item) => `- ${item.domain}: ${item.count} queries`), '', '## Anomalies',
      ...(report.anomalies || []).map((item) => `- **${item.severity.toUpperCase()} · ${item.title}** — ${item.description}`),
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); pushToast('Markdown report copied'); }
    catch { pushToast('Clipboard access is unavailable', 'error'); }
  };

  if (loading) return <div className="page-view"><div className="page-heading"><div><div className="eyebrow">Incident notes · printable output</div><h1>Reports</h1></div></div><div className="page-loading"><Spinner label="Loading report" /> Building report summary…</div></div>;
  if (error) return <div className="page-view"><div className="page-heading"><div><div className="eyebrow">Incident notes · printable output</div><h1>Reports</h1></div><button className="button button-secondary" onClick={loadReport}><RefreshCw size={14} /> Retry</button></div><div className="error-inline">{error}</div></div>;
  if (!report?.total) return <div className="page-view"><div className="page-heading"><div><div className="eyebrow">Incident notes · printable output</div><h1>Reports</h1><p>Generate a printable summary or copy a Markdown investigation brief.</p></div></div><EmptyState title="Nothing to report yet" description="Ingest logs to prepare a network activity summary." /></div>;

  const typeData = Object.entries(report.by_type || {}).map(([type, count]) => ({ type, count }));
  const timelineData = (report.by_hour || []).map((item) => ({ hour: item.hour, label: new Date(item.hour).toLocaleTimeString([], { hour: '2-digit' }), system: item.count, dhcp: 0, dns: 0, kernel: 0, firewall: 0, ppp: 0 }));
  const tiles = [['total', 'Total events'], ['critical', 'Critical events'], ['devices', 'Devices observed'], ['anomaly_count', 'Anomalies detected'], ['dns_queries', 'DNS events'], ['blocked', 'Firewall blocks']];
  return (
    <div className="page-view">
      <div className="page-heading"><div><div className="eyebrow">Incident notes · printable output</div><h1>Reports</h1><p>Generated {formatDateTime(report.generated_at, utcMode, true)} {utcMode ? 'UTC' : 'local'} · collector summary.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={copyMarkdown}><Clipboard size={14} /> Copy as Markdown</button><button className="button button-primary" onClick={downloadPdf} disabled={exporting}>{exporting ? <><Spinner size="small" /> Preparing</> : <><Printer size={14} /> Generate PDF</>}</button></div></div>
      <section className="report-tiles">{tiles.map(([key, label]) => <article className="report-tile" key={key}><span>{label}</span><strong className="mono">{Number(report[key] || 0).toLocaleString()}</strong></article>)}</section>
      <section className="report-grid"><article className="panel report-panel"><div className="panel-heading"><div><div className="panel-title">Top talkers</div><div className="panel-subtitle">Source addresses by event count</div></div></div><div className="table-scroll report-table-wrap"><table className="data-table"><thead><tr><th>Source IP</th><th>Events</th></tr></thead><tbody>{(report.top_talkers || []).map((item) => <tr key={item.ip}><td className="mono">{item.ip}</td><td className="mono">{item.count}</td></tr>)}</tbody></table></div></article><article className="panel report-panel"><div className="panel-heading"><div><div className="panel-title">Top queried domains</div><div className="panel-subtitle">DNS names extracted from logs</div></div></div><div className="table-scroll report-table-wrap"><table className="data-table"><thead><tr><th>Domain</th><th>Queries</th></tr></thead><tbody>{(report.top_domains || []).map((item) => <tr key={item.domain}><td className="mono">{item.domain}</td><td className="mono">{item.count}</td></tr>)}</tbody></table></div></article></section>
      <section className="panel report-panel"><div className="panel-heading"><div><div className="panel-title">Event volume by type</div><div className="panel-subtitle">Static summary distribution</div></div></div><div className="report-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={typeData} layout="vertical" margin={{ top: 6, right: 22, left: 18, bottom: 5 }}><CartesianGrid stroke="#27313b" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: '#82909e', fontSize: 9 }} /><YAxis type="category" dataKey="type" width={100} tick={{ fill: '#a8b5c2', fontSize: 10 }} /><Tooltip contentStyle={{ background: '#111820', border: '1px solid #303944', color: '#e6edf3', fontSize: 10 }} /><Bar dataKey="count" fill="#2f81f7" radius={[0, 4, 4, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></section>
      <section className="panel report-panel"><div className="panel-heading"><div><div className="panel-title">Event timeline</div><div className="panel-subtitle">Hourly volume over the last 24 hours</div></div></div><div className="report-timeline"><EventsTimelineChart data={timelineData} /></div></section>
      <section className="panel report-panel"><div className="panel-heading"><div><div className="panel-title">Detected anomalies</div><div className="panel-subtitle">Rule matches from local log data</div></div></div><div className="report-anomalies">{(report.anomalies || []).length ? report.anomalies.map((item) => <div className="report-anomaly" key={item.id}><span className={`severity-dot ${item.severity === 'critical' ? 'critical' : 'warning'}`} /><div><strong>{item.title}</strong><p>{item.description}</p></div><time className="mono">{formatDateTime(item.detected_at, utcMode, true)}</time></div>) : <span className="muted">No anomalies were detected.</span>}</div></section>
    </div>
  );
}
