// === filename: frontend/src/pages/Devices.jsx ===
import { useEffect, useMemo, useState } from 'react';
import { Download, Pencil, ShieldCheck, ShieldOff } from 'lucide-react';
import { useLocation } from 'wouter';
import { api } from '../api.js';
import { useSiemStore } from '../store.js';
import EmptyState from '../components/ui/EmptyState.jsx';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { formatDateTime } from '../utils/time.js';

/** DHCP/ARP device inventory with trust controls, editing, and CSV export. */
export default function Devices() {
  const [, setLocation] = useLocation();
  const loadDevices = useSiemStore((state) => state.loadDevices);
  const devices = useSiemStore((state) => state.devices);
  const loading = useSiemStore((state) => state.loading.devices);
  const pushToast = useSiemStore((state) => state.pushToast);
  const utcMode = useSiemStore((state) => state.utcMode);
  const [editDevice, setEditDevice] = useState(null);
  const [form, setForm] = useState({ hostname: '', notes: '', tags: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadDevices(); }, [loadDevices]);
  const ordered = useMemo(() => [...devices].sort((a, b) => (a.ip_address || '').localeCompare(b.ip_address || '', undefined, { numeric: true })), [devices]);

  const filterDevice = (device) => {
    useSiemStore.getState().queueLogFilter({ field: device.ip_address ? 'source_ip' : 'search', value: device.ip_address || device.mac_address });
    setLocation('/explorer');
  };
  const toggleTrusted = async (device) => {
    try { await api.updateDevice(device.id, { is_trusted: !device.is_trusted }); await loadDevices(); pushToast(device.is_trusted ? 'Device removed from trusted list' : 'Device marked as trusted'); }
    catch (error) { pushToast(error.userMessage || 'Could not update trusted status', 'error'); }
  };
  const openEdit = (device) => { setEditDevice(device); setForm({ hostname: device.hostname || '', notes: device.notes || '', tags: (device.tags || []).join(', ') }); };
  const saveEdit = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      await api.updateDevice(editDevice.id, { hostname: form.hostname || null, notes: form.notes || null, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) });
      await loadDevices(); setEditDevice(null); pushToast('Device inventory updated');
    } catch (error) { pushToast(error.userMessage || 'Could not update device', 'error'); }
    finally { setSaving(false); }
  };
  const exportCsv = () => {
    const fields = ['ip_address', 'mac_address', 'hostname', 'vendor', 'first_seen', 'last_seen', 'total_events', 'status', 'is_trusted', 'tags'];
    const quote = (value) => `"${String(Array.isArray(value) ? value.join('; ') : value ?? '').replaceAll('"', '""')}"`;
    const csv = [fields.join(','), ...ordered.map((device) => fields.map((field) => quote(device[field])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'openhome-siem-devices.csv'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); pushToast('Device list exported');
  };

  return (
    <div className="page-view">
      <div className="page-heading"><div><div className="eyebrow">DHCP and ARP inventory</div><h1>Devices</h1><p>Known network clients with history, trust state, and investigation links.</p></div><button className="button button-secondary" onClick={exportCsv} disabled={!ordered.length}><Download size={14} /> Export device list</button></div>
      <section className="panel device-panel"><div className="panel-heading"><div><div className="panel-title">Network inventory <span className="count-muted">{ordered.length}</span></div><div className="panel-subtitle">Trusted devices are excluded from new-device detections.</div></div></div>
        {loading && !ordered.length ? <div className="loading-inline"><Spinner label="Loading devices" /> Loading device inventory…</div> : ordered.length === 0 ? <EmptyState title="No devices discovered" description="DHCP and ARP traffic from the router will populate the inventory." /> : <div className="table-scroll"><table className="data-table device-table"><thead><tr><th>IP address</th><th>MAC address</th><th>Hostname</th><th>Vendor</th><th>First seen</th><th>Last seen</th><th>Events</th><th>Status</th><th>Trusted</th><th>Tags</th><th>Actions</th></tr></thead><tbody>{ordered.map((device) => <tr key={device.id} onClick={() => filterDevice(device)}><td><button className="indicator-link mono" onClick={(event) => { event.stopPropagation(); filterDevice(device); }}>{device.ip_address || '—'}</button></td><td className="mono">{device.mac_address || '—'}</td><td>{device.hostname || 'Unknown'}</td><td>{device.vendor || '—'}</td><td className="mono">{device.first_seen ? formatDateTime(device.first_seen, utcMode) : '—'}</td><td className="mono">{device.last_seen ? formatDateTime(device.last_seen, utcMode) : '—'}</td><td className="mono">{Number(device.total_events || 0).toLocaleString()}</td><td><span className={`status-tag status-${String(device.status || 'gone').toLowerCase()}`}>{device.status}</span></td><td><button className={`trusted-toggle ${device.is_trusted ? 'trusted' : ''}`} onClick={(event) => { event.stopPropagation(); toggleTrusted(device); }} aria-label={`${device.is_trusted ? 'Remove trust from' : 'Trust'} ${device.hostname || device.mac_address}`} title={device.is_trusted ? 'Remove trusted status' : 'Mark as trusted'}>{device.is_trusted ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}</button></td><td>{(device.tags || []).map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</td><td><button className="icon-action" onClick={(event) => { event.stopPropagation(); openEdit(device); }} aria-label={`Edit ${device.hostname || 'device'}`}><Pencil size={14} /></button></td></tr>)}</tbody></table></div>}
      </section>
      <Modal open={Boolean(editDevice)} title={`Edit device · ${editDevice?.ip_address || editDevice?.mac_address || ''}`} onClose={() => setEditDevice(null)}>
        <form className="form-stack" onSubmit={saveEdit}><label>Hostname<input value={form.hostname} onChange={(event) => setForm((current) => ({ ...current, hostname: event.target.value }))} maxLength={128} /></label><label>Notes<textarea rows="4" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label><label>Tags <span className="muted">comma separated</span><input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} /></label><div className="modal-actions"><button type="button" className="button button-tertiary" onClick={() => setEditDevice(null)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? <><Spinner size="small" /> Saving</> : 'Save device'}</button></div></form>
      </Modal>
    </div>
  );
}
