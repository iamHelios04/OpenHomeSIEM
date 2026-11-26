// === filename: frontend/src/components/ui/StatCard.jsx ===
/** Accessible metric tile that keeps live values in sync with the collector. */
export default function StatCard({ label, value = 0, tone = 'blue', footnote = '', icon: Icon, critical = false }) {
  const target = Number(value) || 0;
  return (
    <article className={`stat-card tone-${tone}`} aria-label={`${label}: ${target.toLocaleString()}`}>
      <div className="stat-top"><span>{label}{critical && target > 0 && <i className="critical-pulse" aria-label="Critical events present" />}</span>{Icon && <Icon size={16} aria-hidden="true" />}</div>
      <div className="stat-value mono">{target.toLocaleString()}</div>
      {footnote && <div className="stat-footnote">{footnote}</div>}
    </article>
  );
}
