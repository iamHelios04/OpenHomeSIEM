// === filename: frontend/src/components/ui/EmptyState.jsx ===
import { Search } from 'lucide-react';

/** Consistent illustrated empty state for pages and panels. */
export default function EmptyState({ title = 'No data yet', description = 'Import logs to start exploring this workspace.', action }) {
  return <div className="empty-state"><svg viewBox="0 0 120 84" role="img" aria-label="Empty network event illustration"><path d="M18 66h84M30 53l17-16 14 12 29-30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="30" cy="53" r="4" fill="#2f81f7"/><circle cx="47" cy="37" r="4" fill="#39d5ff"/><circle cx="61" cy="49" r="4" fill="#bc8cff"/><circle cx="90" cy="19" r="4" fill="#3fb950"/></svg><h3>{title}</h3><p>{description}</p>{action || <span className="empty-icon"><Search size={16} /></span>}</div>;
}
