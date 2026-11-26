// === filename: frontend/src/pages/Timeline.jsx ===
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Clock3 } from 'lucide-react';
import { api } from '../api.js';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import LogMessage from '../components/ui/LogMessage.jsx';
import { useSiemStore } from '../store.js';
import { formatClock, formatMinute } from '../utils/time.js';

const types = ['All', 'DHCP', 'DNS', 'Kernel', 'Firewall', 'System', 'PPP', 'Other'];
const eventColor = { DHCP: '#bc8cff', DNS: '#39d5ff', Kernel: '#d29922', Firewall: '#f85149', System: '#8b949e', PPP: '#3fb950', Other: '#2f81f7' };

/** Newest-first, collapsible minute groups with gap markers and jump navigation. */
export default function Timeline() {
  const [type, setType] = useState('All');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [jumpTo, setJumpTo] = useState('');
  const [focusedId, setFocusedId] = useState(null);
  const [error, setError] = useState('');
  const containerRef = useRef(null);
  const pushToast = useSiemStore((state) => state.pushToast);
  const utcMode = useSiemStore((state) => state.utcMode);
  const loadPage = async (targetPage, append = false) => {
    setLoading(true); setError('');
    try {
      const result = await api.logs({ page: targetPage, page_size: 100, type: type === 'All' ? undefined : type, sort_by: 'timestamp', sort_dir: 'desc' });
      setRows((current) => append ? [...current, ...result.items] : result.items);
      setPage(targetPage); setTotalPages(result.pages || 1);
    } catch (failure) { setError(failure.userMessage || 'Could not load timeline events'); }
    finally { setLoading(false); }
  };
  useEffect(() => { setPage(1); loadPage(1, false); }, [type]);

  const groups = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const key = formatMinute(row.timestamp, utcMode);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return [...map.entries()].sort((a, b) => b[1][0].timestamp.localeCompare(a[1][0].timestamp));
  }, [rows, utcMode]);

  useEffect(() => {
    if (!focusedId) return;
    const element = containerRef.current?.querySelector(`#timeline-event-${focusedId}`);
    if (element) {
      element.closest('details')?.setAttribute('open', 'open');
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFocusedId(null);
    }
  }, [focusedId, groups]);

  const jump = async () => {
    if (!jumpTo) { pushToast('Choose a date and time first', 'warning'); return; }
    setLoading(true);
    try {
      const target = new Date(jumpTo).getTime();
      const result = await api.logs({ page: 1, page_size: 10000, type: type === 'All' ? undefined : type, sort_by: 'timestamp', sort_dir: 'desc' });
      if (!result.items.length) { pushToast('No events are loaded', 'warning'); return; }
      const nearest = result.items.reduce((best, row) => Math.abs(new Date(row.timestamp).getTime() - target) < Math.abs(new Date(best.timestamp).getTime() - target) ? row : best);
      setRows(result.items); setTotalPages(result.pages || 1); setPage(1); setFocusedId(nearest.id);
    } catch (failure) { pushToast(failure.userMessage || 'Could not find an event near that time', 'error'); }
    finally { setLoading(false); }
  };

  let previousTime = null;
  return (
    <div className="page-view">
      <div className="page-heading"><div><div className="eyebrow">Chronological investigation</div><h1>Event timeline</h1><p>Events are grouped by minute. Long quiet periods are shown as gaps.</p></div><div className="jump-controls"><input type="datetime-local" value={jumpTo} onChange={(event) => setJumpTo(event.target.value)} aria-label="Jump to time" /><button className="button button-secondary" onClick={jump}><Clock3 size={14} /> Jump to time</button></div></div>
      <section className="panel timeline-filters"><span className="filter-caption">Event type</span>{types.map((item) => <button key={item} className={`filter-chip ${type === item ? 'active' : ''}`} onClick={() => setType(item)}>{item}</button>)}</section>
      <section className="panel timeline-panel" ref={containerRef}>
        {loading && rows.length === 0 ? <div className="loading-inline"><Spinner label="Loading timeline" /> Loading timeline…</div> : error ? <div className="error-inline">{error}</div> : groups.length === 0 ? <EmptyState title="Timeline is waiting for events" description="Newly ingested events will appear here grouped by minute." /> : <div className="timeline-groups">{groups.map(([key, events], groupIndex) => {
          const firstTime = new Date(events[0].timestamp).getTime();
          const gapMinutes = previousTime === null ? 0 : Math.floor((previousTime - firstTime) / 60000);
          previousTime = firstTime;
          return <div key={key}>{gapMinutes > 4 && <div className="gap-indicator">◌ No events for {gapMinutes} minutes</div>}<details className="minute-group" open={groupIndex === 0}><summary><span className="timeline-chevron">›</span><time>{key}</time><span className="group-count">{events.length} event{events.length === 1 ? '' : 's'}</span></summary><div className="minute-events">{events.map((row) => <article key={row.id} id={`timeline-event-${row.id}`} className="timeline-event" style={{ '--event-color': eventColor[row.type] || eventColor.Other }}><div className="timeline-event-meta"><time className="mono">{formatClock(row.timestamp, utcMode)}</time><Badge type={row.type}>{row.type}</Badge><span className="mono process-text">{row.process}</span><Badge severity={row.severity_group}>{row.severity_name}</Badge></div><div className="timeline-event-message"><LogMessage text={row.message} /></div></article>)}</div></details></div>;
        })}</div>}
        <div className="timeline-footer">{loading && rows.length > 0 && <span><Spinner size="small" /> Loading events…</span>}<span>{rows.length.toLocaleString()} events loaded</span><button className="button button-secondary button-small" disabled={loading || page >= totalPages} onClick={() => loadPage(page + 1, true)}><ArrowDownToLine size={13} /> Load older events</button></div>
      </section>
    </div>
  );
}
