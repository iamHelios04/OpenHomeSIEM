// === filename: frontend/src/pages/Alerts.jsx ===
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LogMessage from '../components/ui/LogMessage.jsx';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useSiemStore } from '../store.js';
import { formatDateTime } from '../utils/time.js';

function MarkdownText({ value }) {
  return <div className="markdown-body">{String(value || '').split('\n').map((line, index) => {
    const fragments = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, partIndex) => {
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={partIndex}>{part.slice(1, -1)}</code>;
      return part;
    });
    return <p key={index}>{fragments.length ? fragments : '\u00a0'}</p>;
  })}</div>;
}

/** Analyst workspace for opening, assigning, and closing investigations. */
export default function Alerts() {
  const loadAlerts = useSiemStore((state) => state.loadAlerts);
  const alerts = useSiemStore((state) => state.alerts);
  const loading = useSiemStore((state) => state.loading.alerts);
  const pushToast = useSiemStore((state) => state.pushToast);
  const utcMode = useSiemStore((state) => state.utcMode);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [relatedLogs, setRelatedLogs] = useState({});
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', severity: 'medium', body: '', relatedIds: '' });

  useEffect(() => { loadAlerts(statusFilter === 'all' ? {} : { status: statusFilter }); }, [loadAlerts, statusFilter]);
  const visible = useMemo(() => [...alerts].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)), [alerts]);

  const expand = async (alert) => {
    if (expandedId === alert.id) { setExpandedId(null); return; }
    setExpandedId(alert.id);
    const ids = alert.related_ids || [];
    if (!ids.length) { setRelatedLogs((current) => ({ ...current, [alert.id]: [] })); return; }
    setRelatedLoading(true);
    try {
      const records = await Promise.all(ids.slice(0, 50).map((id) => api.log(id).catch(() => null)));
      setRelatedLogs((current) => ({ ...current, [alert.id]: records.filter(Boolean) }));
    } finally { setRelatedLoading(false); }
  };

  const create = async (event) => {
    event.preventDefault();
    const related_ids = form.relatedIds.split(/[\s,;]+/).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
    setSaving(true);
    try {
      await api.createAlert({ title: form.title.trim(), severity: form.severity, body: form.body, related_ids });
      await loadAlerts(statusFilter === 'all' ? {} : { status: statusFilter });
      setCreateOpen(false); setForm({ title: '', severity: 'medium', body: '', relatedIds: '' }); pushToast('Investigation alert created');
    } catch (error) { pushToast(error.userMessage || 'Could not create alert', 'error'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (alert, status) => {
    try { await api.updateAlert(alert.id, { status }); await loadAlerts(statusFilter === 'all' ? {} : { status: statusFilter }); pushToast('Alert status updated'); }
    catch (error) { pushToast(error.userMessage || 'Could not update alert', 'error'); }
  };

  const remove = async (alert) => {
    if (!window.confirm(`Delete investigation “${alert.title}”?`)) return;
    try { await api.deleteAlert(alert.id); await loadAlerts(statusFilter === 'all' ? {} : { status: statusFilter }); pushToast('Investigation deleted'); }
    catch (error) { pushToast(error.userMessage || 'Could not delete alert', 'error'); }
  };

  return (
    <div className="page-view">
      <div className="page-heading"><div><div className="eyebrow">Analyst workspace</div><h1>Alerts</h1><p>Track investigations, attach event IDs, and record analyst notes.</p></div><button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> New investigation</button></div>
      <section className="panel alerts-workspace"><div className="panel-heading"><div><div className="panel-title">Investigation queue <span className="count-muted">{visible.length}</span></div><div className="panel-subtitle">Alert notes are stored with the event database.</div></div><label className="filter-field compact"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="investigating">Investigating</option><option value="closed">Closed</option></select></label></div>
        {loading && !visible.length ? <div className="loading-inline"><Spinner label="Loading alerts" /> Loading investigation queue…</div> : visible.length === 0 ? <EmptyState title="No analyst alerts" description="Create an investigation note to track an event or incident." action={<button className="button button-secondary" onClick={() => setCreateOpen(true)}>Create first alert</button>} /> : <div className="alert-queue">{visible.map((alert) => <article className={`alert-card ${expandedId === alert.id ? 'expanded' : ''}`} key={alert.id}><div className="alert-card-top" onClick={() => expand(alert)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') expand(alert); }}><div className="alert-card-main"><Badge severity={alert.severity}>{alert.severity}</Badge><strong>{alert.title}</strong><span className={`status-tag status-${alert.status}`}>{alert.status}</span></div><div className="alert-card-meta"><time>{formatDateTime(alert.created_at, utcMode)}</time><span>{alert.related_ids?.length || 0} linked event IDs</span><ChevronDown size={15} /></div></div>{expandedId !== alert.id && alert.body && <div className="alert-preview">{alert.body.slice(0, 220)}{alert.body.length > 220 ? '…' : ''}</div>}{expandedId === alert.id && <div className="alert-card-detail"><MarkdownText value={alert.body} /><div className="alert-edit-row"><label>Status<select value={alert.status} onChange={(event) => updateStatus(alert, event.target.value)}><option value="open">Open</option><option value="investigating">Investigating</option><option value="closed">Closed</option></select></label><button className="button button-danger button-small" onClick={() => remove(alert)}><Trash2 size={13} /> Delete alert</button></div><div className="related-evidence"><div className="detail-section-title">Related log records</div>{relatedLoading ? <Spinner label="Loading linked logs" /> : (relatedLogs[alert.id] || []).length ? relatedLogs[alert.id].map((record) => <div className="related-log" key={record.id}><span className="mono">#{record.id} · {formatDateTime(record.timestamp, utcMode, true)}</span><Badge type={record.type}>{record.type}</Badge><LogMessage text={record.message} /></div>) : <span className="muted">{alert.related_ids?.length ? 'No linked records were found.' : 'No events are linked to this alert.'}</span>}</div></div>}</article>)}</div>}
      </section>
      <Modal open={createOpen} title="Create investigation alert" onClose={() => setCreateOpen(false)} size="wide"><form className="form-stack" onSubmit={create}><label>Title<input required maxLength={256} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} autoFocus /></label><label>Severity<select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select></label><label>Investigation notes <span className="muted">Markdown formatting supported</span><textarea rows="7" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="**Summary**\nWhat happened, impact, and follow-up…" /></label><label>Related log IDs <span className="muted">comma or space separated</span><input value={form.relatedIds} onChange={(event) => setForm((current) => ({ ...current, relatedIds: event.target.value }))} placeholder="1042, 1043" /></label><div className="modal-actions"><button type="button" className="button button-tertiary" onClick={() => setCreateOpen(false)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? <><Spinner size="small" /> Saving</> : 'Create alert'}</button></div></form></Modal>
    </div>
  );
}
