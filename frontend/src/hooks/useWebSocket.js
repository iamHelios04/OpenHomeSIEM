// === filename: frontend/src/hooks/useWebSocket.js ===
import { useEffect } from 'react';
import { connectLogSocket } from '../api.js';
import { useSiemStore } from '../store.js';

/** Connect to the collector and apply pushed log, anomaly, and device events. */
export function useWebSocket() {
  useEffect(() => connectLogSocket(
    (message) => useSiemStore.getState().receiveRealtime(message),
    (status) => useSiemStore.getState().setSocketStatus(status),
  ), []);
}
