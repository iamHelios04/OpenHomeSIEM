// === filename: frontend/src/components/ui/Tooltip.jsx ===
/** Lightweight accessible tooltip using the native title attribute. */
export default function Tooltip({ label, children, disabled = false }) {
  if (disabled || !label) return children;
  return <span className="tooltip-wrap" title={label} aria-label={label}>{children}</span>;
}
