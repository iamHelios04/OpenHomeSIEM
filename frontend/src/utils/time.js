// === filename: frontend/src/utils/time.js ===
/** Format a stored timestamp in the operator's selected clock. */
export function formatClock(value, utc = false, seconds = true) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), ...(utc ? { timeZone: 'UTC' } : {}) }).format(date);
}

/** Format a date and time consistently with the UTC toggle. */
export function formatDateTime(value, utc = false, withSeconds = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}), ...(utc ? { timeZone: 'UTC' } : {}) }).format(date);
}

/** Return a minute bucket key in local time or UTC. */
export function formatMinute(value, utc = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const month = utc ? date.getUTCMonth() + 1 : date.getMonth() + 1;
  const day = utc ? date.getUTCDate() : date.getDate();
  const hour = utc ? date.getUTCHours() : date.getHours();
  const minute = utc ? date.getUTCMinutes() : date.getMinutes();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}${utc ? ' UTC' : ''}`;
}
