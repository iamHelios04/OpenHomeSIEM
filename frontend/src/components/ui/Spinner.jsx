// === filename: frontend/src/components/ui/Spinner.jsx ===
/** Inline loading indicator with an accessible label. */
export default function Spinner({ label = 'Loading', size = 'normal' }) {
  return <span className={`spinner ${size === 'small' ? 'spinner-small' : ''}`} role="status" aria-label={label} />;
}
