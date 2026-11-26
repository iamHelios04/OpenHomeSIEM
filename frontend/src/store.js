// === filename: frontend/src/store.js ===
import { create } from 'zustand';
import { api } from './api.js';

let pendingRealtimeLogs = [];
let realtimeFlushTimer = null;
let realtimeFlashTimer = null;

export const useSiemStore = create((set, get) => ({
  stats: { total: 0, critical: 0, warning: 0, devices: 0, dns_queries: 0, dhcp_leases: 0, blocked: 0, anomalies: 0, by_type: {}, by_hour: [] },
  health: { status: 'connecting', syslog_enabled: false, syslog_listeners: { udp: false, tcp: false } },
  logs: [],
  newLogIds: [],
  devices: [],
  anomalies: [],
  alerts: [],
  selectedRecord: null,
  socketStatus: 'connecting',
  utcMode: false,
  lastUpdated: null,
  tailMode: true,
  pendingLogFilter: null,
  toasts: [],
  loading: {},
  setSocketStatus: (socketStatus) => set({ socketStatus }),
  setUtcMode: (utcMode) => set({ utcMode }),
  loadHealth: async () => {
    try { set({ health: await api.health() }); }
    catch { set((state) => ({ health: { ...state.health, status: 'offline' } })); }
  },
  setSelectedRecord: (selectedRecord) => set({ selectedRecord }),
  setTailMode: (tailMode) => set({ tailMode }),
  queueLogFilter: (pendingLogFilter) => set({ pendingLogFilter }),
  consumeLogFilter: () => set({ pendingLogFilter: null }),
  pushToast: (message, kind = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, kind }] }));
    window.setTimeout(() => get().dismissToast(id), 3500);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  loadDashboard: async () => {
    set((state) => ({ loading: { ...state.loading, dashboard: true } }));
    try {
      const [stats, anomalies, alerts, logs] = await Promise.all([
        api.stats(), api.anomalies({ page: 1, page_size: 10, resolved: false }), api.alerts({ page: 1, page_size: 10 }), api.logs({ page: 1, page_size: 20, sort_by: 'timestamp', sort_dir: 'desc' }),
      ]);
      set((state) => ({ stats, anomalies: anomalies.items, alerts: alerts.items, logs: logs.items, lastUpdated: new Date(), loading: { ...state.loading, dashboard: false } }));
    } catch (error) {
      set((state) => ({ loading: { ...state.loading, dashboard: false } }));
      get().pushToast(error.userMessage || 'Could not load dashboard data', 'error');
    }
  },
  loadDevices: async () => {
    set((state) => ({ loading: { ...state.loading, devices: true } }));
    try {
      const result = await api.devices({ page: 1, page_size: 10000 });
      set((state) => ({ devices: result.items, loading: { ...state.loading, devices: false } }));
    } catch (error) {
      set((state) => ({ loading: { ...state.loading, devices: false } }));
      get().pushToast(error.userMessage || 'Could not load devices', 'error');
    }
  },
  loadAnomalies: async (params = {}) => {
    set((state) => ({ loading: { ...state.loading, anomalies: true } }));
    try {
      const result = await api.anomalies({ page: 1, page_size: 500, ...params });
      set((state) => ({ anomalies: result.items, loading: { ...state.loading, anomalies: false } }));
      return result;
    } catch (error) {
      set((state) => ({ loading: { ...state.loading, anomalies: false } }));
      get().pushToast(error.userMessage || 'Could not load anomalies', 'error');
      return null;
    }
  },
  loadAlerts: async (params = {}) => {
    set((state) => ({ loading: { ...state.loading, alerts: true } }));
    try {
      const result = await api.alerts({ page: 1, page_size: 500, ...params });
      set((state) => ({ alerts: result.items, loading: { ...state.loading, alerts: false } }));
      return result;
    } catch (error) {
      set((state) => ({ loading: { ...state.loading, alerts: false } }));
      get().pushToast(error.userMessage || 'Could not load alerts', 'error');
      return null;
    }
  },
  receiveRealtime: (event) => {
    const { type, data } = event || {};
    if (!data) return;
    if (type === 'log') {
      pendingRealtimeLogs.push(data);
      if (!realtimeFlushTimer) realtimeFlushTimer = window.setTimeout(() => {
        realtimeFlushTimer = null;
        get().flushRealtimeLogs();
      }, 80);
    } else if (type === 'anomaly') {
      let shouldNotify = false;
      set((state) => {
        const existing = state.anomalies.find((item) => item.id === data.id);
        shouldNotify = !existing && !data.resolved;
        const delta = data.resolved ? (existing && !existing.resolved ? -1 : 0) : (existing?.resolved ? 1 : shouldNotify ? 1 : 0);
        return {
          anomalies: [data, ...state.anomalies.filter((item) => item.id !== data.id)].slice(0, 500),
          stats: { ...state.stats, anomalies: Math.max(0, (state.stats.anomalies || 0) + delta) },
        };
      });
      if (shouldNotify) get().pushToast(`New detection: ${data.title}`, 'warning');
    } else if (type === 'device') {
      set((state) => {
        const exists = state.devices.some((item) => item.id === data.id);
        return { devices: [data, ...state.devices.filter((item) => item.id !== data.id)], stats: { ...state.stats, devices: state.stats.devices + (exists ? 0 : 1) } };
      });
    }
  },
  flushRealtimeLogs: () => {
    if (!pendingRealtimeLogs.length) return;
    const batch = pendingRealtimeLogs.splice(0).reverse();
    set((state) => {
      const seen = new Set(state.logs.map((row) => row.id));
      const fresh = batch.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
      if (!fresh.length) return state;
      const byType = { ...state.stats.by_type };
      let critical = 0; let warning = 0; let dns = 0; let leases = 0; let blocked = 0;
      fresh.forEach((row) => {
        byType[row.type] = (byType[row.type] || 0) + 1;
        const level = Number(row.severity);
        if (level <= 3) critical += 1;
        if (level === 4) warning += 1;
        if (row.type === 'DNS') dns += 1;
        if (row.type === 'DHCP' && /DHCPACK/i.test(row.message || '')) leases += 1;
        if (row.type === 'Firewall') blocked += 1;
      });
      return {
        logs: [...fresh, ...state.logs].slice(0, 5000),
        newLogIds: fresh.map((row) => row.id),
        stats: { ...state.stats, total: state.stats.total + fresh.length, critical: state.stats.critical + critical, warning: state.stats.warning + warning, dns_queries: state.stats.dns_queries + dns, dhcp_leases: state.stats.dhcp_leases + leases, blocked: state.stats.blocked + blocked, by_type: byType },
        lastUpdated: new Date(),
      };
    });
    if (realtimeFlashTimer) window.clearTimeout(realtimeFlashTimer);
    realtimeFlashTimer = window.setTimeout(() => { realtimeFlashTimer = null; set({ newLogIds: [] }); }, 900);
  },
}));
