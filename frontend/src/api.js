// === filename: frontend/src/api.js ===
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
export const http = axios.create({ baseURL, timeout: 30000, headers: { 'Content-Type': 'application/json' } });

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error?.response?.data?.detail;
    error.userMessage = typeof detail === 'string' ? detail : error?.message || 'Request failed';
    return Promise.reject(error);
  },
);

export const api = {
  health: () => http.get('/health').then((r) => r.data),
  stats: () => http.get('/stats').then((r) => r.data),
  logs: (params = {}) => http.get('/logs', { params }).then((r) => r.data),
  log: (id) => http.get(`/logs/${id}`).then((r) => r.data),
  logOptions: () => http.get('/logs/options').then((r) => r.data),
  ingest: (lines, source_device = 'router', device_type = 'router') => http.post('/ingest', { lines, source_device, device_type }).then((r) => r.data),
  devices: (params = {}) => http.get('/devices', { params }).then((r) => r.data),
  device: (id) => http.get(`/devices/${id}`).then((r) => r.data),
  createDevice: (payload) => http.post('/devices', payload).then((r) => r.data),
  updateDevice: (id, payload) => http.patch(`/devices/${id}`, payload).then((r) => r.data),
  anomalies: (params = {}) => http.get('/anomalies', { params }).then((r) => r.data),
  updateAnomaly: (id, payload) => http.patch(`/anomalies/${id}`, payload).then((r) => r.data),
  alerts: (params = {}) => http.get('/alerts', { params }).then((r) => r.data),
  createAlert: (payload) => http.post('/alerts', payload).then((r) => r.data),
  updateAlert: (id, payload) => http.patch(`/alerts/${id}`, payload).then((r) => r.data),
  deleteAlert: (id) => http.delete(`/alerts/${id}`),
  report: () => http.get('/reports/summary').then((r) => r.data),
  reportPdf: () => http.get('/reports/summary.pdf', { responseType: 'blob' }).then((r) => r.data),
};

export async function fetchAllLogs(filters = {}, onProgress = () => {}) {
  const pageSize = 10000;
  const first = await api.logs({ ...filters, page: 1, page_size: pageSize });
  const results = [...first.items];
  onProgress(results.length, first.total);
  for (let page = 2; page <= first.pages; page += 1) {
    const batch = await api.logs({ ...filters, page, page_size: pageSize });
    results.push(...batch.items);
    onProgress(results.length, first.total);
  }
  return results;
}

export function connectLogSocket(onMessage, onStatus) {
  const explicit = import.meta.env.VITE_WS_URL;
  const inferred = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/logs`;
  const url = explicit || inferred;
  let socket;
  let retryTimer;
  let retryAttempt = 0;
  let closed = false;

  const connect = () => {
    if (closed) return;
    try {
      socket = new WebSocket(url);
    } catch {
      onStatus?.('disconnected');
      scheduleReconnect();
      return;
    }
    socket.onopen = () => {
      retryAttempt = 0;
      onStatus?.('connected');
    };
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        onMessage?.(payload);
      } catch {
        onStatus?.('error');
      }
    };
    socket.onerror = () => onStatus?.('error');
    socket.onclose = () => {
      onStatus?.('disconnected');
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closed || retryTimer) return;
    const delay = Math.min(30000, 1000 * (2 ** retryAttempt)) + Math.floor(Math.random() * 250);
    retryAttempt = Math.min(retryAttempt + 1, 5);
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      connect();
    }, delay);
  };

  connect();
  return () => {
    closed = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    socket?.close(1000, 'application unmounted');
  };
}
