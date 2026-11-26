// === filename: frontend/src/hooks/useLogExplorer.js ===
import { useEffect, useState } from 'react';
import { api } from '../api.js';

/** Fetch one bounded log page whenever its filters or page change. */
export function useLogExplorer(filters, page, pageSize = 100, sort = { sort_by: 'timestamp', sort_dir: 'desc' }) {
  const [result, setResult] = useState({ items: [], total: 0, pages: 0, page, page_size: pageSize });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await api.logs({ ...filters, ...sort, page, page_size: pageSize });
        if (active) setResult(payload);
      } catch (failure) {
        if (active) setError(failure.userMessage || 'Log query failed');
      } finally {
        if (active) setLoading(false);
      }
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [filters, page, pageSize, sort, refreshKey]);

  return { ...result, loading, error, refresh: () => setRefreshKey((value) => value + 1) };
}
