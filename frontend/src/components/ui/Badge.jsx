// === filename: frontend/src/components/ui/Badge.jsx ===
const severityClass = {
  critical: 'badge-critical', emergency: 'badge-critical', alert: 'badge-critical', error: 'badge-critical',
  high: 'badge-high', warning: 'badge-warning', medium: 'badge-medium', info: 'badge-info',
  notice: 'badge-info', debug: 'badge-muted', low: 'badge-muted',
};

/** Color-and-icon badge for severity and event type labels. */
export default function Badge({ severity, type, children }) {
  const label = children || severity || type || 'Unknown';
  const key = String(severity || type || label).toLowerCase();
  const icon = ['critical', 'emergency', 'alert', 'error'].includes(key) ? '!' : key === 'warning' || key === 'high' ? '▲' : key === 'debug' ? '·' : '•';
  return <span className={`badge ${severityClass[key] || 'badge-type'}`}><span aria-hidden="true">{icon}</span>{label}</span>;
}
