// === filename: frontend/src/pages/LogExplorer.jsx ===
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api, fetchAllLogs } from '../api.js';
import { useLogExplorer } from '../hooks/useLogExplorer.js';
import { useSiemStore } from '../store.js';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LogMessage from '../components/ui/LogMessage.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { formatClock, formatDateTime } from '../utils/time.js';

const typeFilters = ['All', 'DHCP', 'DNS', 'Kernel', 'Firewall', 'System', 'PPP', 'Other'];
const columns = [
  ['severity', 'Severity'], ['ingested_at', 'Received'], ['timestamp', 'Event time'], ['source_ip', 'Source IP'],
  ['type', 'Type'], ['process', 'Process'], ['message', 'Message'],
];

function toUtc(value) {
  return value ? new Date(value).toISOString() : undefined;
}

/** Filterable 100-row page with virtualized, keyboard-selectable event rows. */
export default function LogExplorer() {
  const [type, setType] = useState('All');
  const [severity, setSeverity] = useState('');
  const [sourceIp, setSourceIp] = useState('');
  const [sourceDevice, setSourceDevice] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [search, setSearch] = useState('');
  const [process, setProcess] = useState('');
  const [domain, setDomain] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ sort_by: 'ingested_at', sort_dir: 'desc' });
  const [sourceOptions, setSourceOptions] = useState([]);
  const [deviceOptions, setDeviceOptions] = useState(['router']);
  const [exporting, setExporting] = useState(false);
  const tail = useSiemStore((state) => state.tailMode);
  const setTail = useSiemStore((state) => state.setTailMode);
  const viewportRef = useRef(null);
  const lastLiveId = useRef(null);
  const selectedRecord = useSiemStore((state) => state.setSelectedRecord);
  const queueLogFilter = useSiemStore((state) => state.queueLogFilter);
  const pendingFilter = useSiemStore((state) => state.pendingLogFilter);
  const consumeLogFilter = useSiemStore((state) => state.consumeLogFilter);
  const liveLogs = useSiemStore((state) => state.logs);
  const utcMode = useSiemStore((state) => state.utcMode);
  const newLogIds = useSiemStore((state) => state.newLogIds);
  const pushToast = useSiemStore((state) => state.pushToast);

  const filters = useMemo(() => ({
    type: type === 'All' ? undefined : type,
    severity_group: severity || undefined,
    source_ip: sourceIp || undefined,
    source_device: sourceDevice || undefined,
    from_time: toUtc(fromTime),
    to_time: toUtc(toTime),
    search: search || undefined,
    process: process || undefined,
    domain: domain || undefined,
  }), [type, severity, sourceIp, sourceDevice, fromTime, toTime, search, process, domain]);
  const stableSort = useMemo(() => sort, [sort.sort_by, sort.sort_dir]);
  const result = useLogExplorer(filters, page, 100, stableSort);
  const rows = result.items || [];
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => viewportRef.current, estimateSize: () => 48, overscan: 8 });

  useEffect(() => {
    let active = true;
    api.logOptions().then((data) => {
      if (!active) return;
      setSourceOptions(data.source_ips || []);
      setDeviceOptions(data.source_devices || ['router']);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!pendingFilter) return;
    const { field, value } = pendingFilter;
    if (field === 'source_ip') setSourceIp(value);
    if (field === 'domain') setDomain(value);
    if (field === 'process') setProcess(value);
    if (field === 'search') setSearch(value);
    setPage(1);
    consumeLogFilter();
  }, [pendingFilter, consumeLogFilter]);

  useEffect(() => {
    const latest = liveLogs[0];
    if (latest?.id && latest.id !== lastLiveId.current) {
      if (lastLiveId.current && tail) {
        result.refresh();
        requestAnimationFrame(() => { if (viewportRef.current) viewportRef.current.scrollTop = 0; });
      }
      lastLiveId.current = latest.id;
    }
  }, [liveLogs, tail]);

  useEffect(() => { if (viewportRef.current) viewportRef.current.scrollTop = 0; }, [page]);

  const clearFilters = () => {
    setType('All'); setSeverity(''); setSourceIp(''); setSourceDevice(''); setFromTime(''); setToTime(''); setSearch(''); setProcess(''); setDomain(''); setPage(1);
  };
  const handleSort = (key) => {
    setSort((current) => ({ sort_by: key, sort_dir: current.sort_by === key && current.sort_dir === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  };
  const exportFiltered = async () => {
    setExporting(true);
    try {
      const data = await fetchAllLogs(filters, (done, total) => { if (total) {} });
      const fields = ['id', 'timestamp', 'severity_name', 'pri', 'facility', 'source_ip', 'type', 'process', 'host', 'mac_address', 'lease_ip', 'wan_ip', 'domains', 'message', 'raw', 'source_device'];
      const quote = (value) => `"${String(Array.isArray(value) ? value.join('; ') : value ?? '').replaceAll('"', '""')}"`;
      const csv = [fields.join(','), ...data.map((row) => fields.map((field) => quote(row[field])).join(','))].join('\r\n');
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'openhome-siem-filtered-logs.csv'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      pushToast(`Exported ${data.length.toLocaleString()} filtered logs`);
    } catch (error) { pushToast(error.userMessage || 'Filtered export failed', 'error'); }
    finally { setExporting(false); }
  };

  const selectIp = (value) => { setSourceIp(value); setPage(1); };
  const filterSummary = [type !== 'All' && `type: ${type}`, severity && `severity: ${severity}`, sourceIp && `source: ${sourceIp}`, sourceDevice && `device: ${sourceDevice}`, fromTime && `from: ${fromTime.replace('T', ' ')}`, toTime && `to: ${toTime.replace('T', ' ')}`, process && `process: ${process}`, domain && `domain: ${domain}`, search && `search: “${search}”`].filter(Boolean);

  return (
    <div className="page-view">
      <div className="page-heading"><div><div className="eyebrow">Investigation workspace</div><h1>Log explorer</h1><p>Search and inspect normalized events from all connected sources.</p></div><button className="button button-secondary" onClick={exportFiltered} disabled={exporting}>{exporting ? <><Spinner size="small" /> Exporting…</> : 'Export filtered CSV'}</button></div>
      <section className="panel filter-panel" aria-label="Log filters">
        <div className="filter-line"><span className="filter-caption"><SlidersHorizontal size={13} /> Type</span><div className="chip-row">{typeFilters.map((item) => <button key={item} className={`filter-chip ${type === item ? 'active' : ''}`} onClick={() => { setType(item); setPage(1); }}>{item}</button>)}</div><label className="filter-field compact"><span>Severity</span><select value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }}><option value="">All severities</option><option>Critical</option><option>Warning</option><option>Info</option><option>Debug</option></select></label></div>
        <div className="filter-line filter-line-secondary"><label className="filter-field"><span>Source IP</span><select value={sourceIp} onChange={(event) => { selectIp(event.target.value); }}><option value="">All IPs</option>{sourceOptions.map((ip) => <option key={ip}>{ip}</option>)}</select></label><label className="filter-field"><span>Source device</span><select value={sourceDevice} onChange={(event) => { setSourceDevice(event.target.value); setPage(1); }}><option value="">All sources</option>{deviceOptions.map((device) => <option key={device}>{device}</option>)}</select></label><label className="filter-field date-field"><span>From</span><input type="datetime-local" value={fromTime} onChange={(event) => { setFromTime(event.target.value); setPage(1); }} /></label><label className="filter-field date-field"><span>To</span><input type="datetime-local" value={toTime} onChange={(event) => { setToTime(event.target.value); setPage(1); }} /></label><label className="search-box"><Search size={15} /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search logs… ( / )" aria-label="Search log messages" /></label><button className="button button-tertiary button-small" onClick={clearFilters}><RotateCcw size={13} /> Clear</button></div>
        {filterSummary.length > 0 && <div className="active-filter-summary"><span>Active filters</span>{filterSummary.map((item) => <span className="filter-summary-chip" key={item}>{item}</span>)}</div>}
      </section>
      <section className="panel log-table-panel" aria-label="Log events">
        <div className="panel-heading table-panel-head"><div><div className="panel-title">Event stream <span className="count-muted">{result.total.toLocaleString()} matches</span></div><div className="panel-subtitle">Newest received first · event time is shown separately</div></div><label className="toggle-control"><input type="checkbox" checked={tail} onChange={(event) => setTail(event.target.checked)} /> Tail mode</label></div>
        <div className="log-table-header" role="row">{columns.map(([key, label]) => <button key={key} className={`log-cell header-cell col-${key}`} role="columnheader" onClick={() => handleSort(key)} aria-sort={sort.sort_by === key ? (sort.sort_dir === 'asc' ? 'ascending' : 'descending') : 'none'}>{label}{sort.sort_by === key && <span>{sort.sort_dir === 'asc' ? ' ↑' : ' ↓'}</span>}</button>)}</div>
        <div className="log-viewport" ref={viewportRef} role="rowgroup" aria-label="Scrollable log table">
          {result.loading && rows.length === 0 ? <div className="loading-inline"><Spinner label="Loading logs" /> Loading events…</div> : result.error ? <div className="error-inline">{result.error}</div> : rows.length === 0 ? <EmptyState title="No matching events" description="Adjust the filters or clear them to see more logs." action={<button className="button button-secondary button-small" onClick={clearFilters}>Clear filters</button>} /> : <div className="virtual-spacer" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              return <div ref={virtualizer.measureElement} data-index={item.index} key={row.id} role="row" tabIndex={0} className={`log-grid-row severity-row-${String(row.severity_group || 'info').toLowerCase()} ${newLogIds.includes(row.id) ? 'live-flash' : ''}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: item.size, transform: `translateY(${item.start}px)` }} onClick={() => selectedRecord(row)} onKeyDown={(event) => { if (event.key === 'Enter') selectedRecord(row); }}>
                <div className="log-cell col-severity"><Badge severity={row.severity_group}>{row.severity_name}</Badge></div>
                <time className="log-cell col-ingested_at mono" title={formatDateTime(row.ingested_at, utcMode, true)}>{formatClock(row.ingested_at, utcMode)}</time>
                <time className="log-cell col-timestamp mono" title={formatDateTime(row.timestamp, utcMode, true)}>{formatClock(row.timestamp, utcMode)}</time>
                <div className="log-cell col-source_ip">{row.source_ip ? <button className="indicator-link mono" onClick={(event) => { event.stopPropagation(); selectIp(row.source_ip); }}>{row.source_ip}</button> : <span className="muted">—</span>}</div>
                <div className="log-cell col-type"><Badge type={row.type}>{row.type}</Badge></div>
                <div className="log-cell col-process"><button className="indicator-link mono" onClick={(event) => { event.stopPropagation(); setProcess(row.process || ''); setPage(1); }}>{row.process || 'unknown'}</button></div>
                <div className="log-cell col-message" title={row.message}><LogMessage text={row.message || ''} highlight={search} /><button className="row-copy" aria-label="Copy raw log line" title="Copy raw log line" onClick={async (event) => { event.stopPropagation(); try { await navigator.clipboard.writeText(row.raw); pushToast('Raw log line copied'); } catch { pushToast('Clipboard access unavailable', 'error'); } }}>Copy</button></div>
              </div>;
            })}
          </div>}
        </div>
        <div className="table-footer"><span>{result.total ? `${((page - 1) * 100 + 1).toLocaleString()}–${Math.min(page * 100, result.total).toLocaleString()} of ${result.total.toLocaleString()}` : '0 records'}</span><div className="pagination-controls"><button className="button button-tertiary button-small" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹ Prev</button><span>Page {page} / {Math.max(1, result.pages)}</span><button className="button button-tertiary button-small" disabled={page >= result.pages} onClick={() => setPage((current) => Math.min(result.pages, current + 1))}>Next ›</button></div></div>
      </section>
    </div>
  );
}
