// === filename: frontend/src/components/ui/Toast.jsx ===
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useSiemStore } from '../../store.js';

const icons = { success: CheckCircle2, warning: AlertTriangle, error: AlertTriangle, info: Info };

/** Screen-reader friendly toast stack backed by the shared app store. */
export default function ToastStack() {
  const toasts = useSiemStore((state) => state.toasts);
  const dismiss = useSiemStore((state) => state.dismissToast);
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = icons[toast.kind] || Info;
        return <div className={`toast toast-${toast.kind}`} key={toast.id} role={toast.kind === 'error' ? 'alert' : 'status'}><Icon size={16} /><span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}><X size={14} /></button></div>;
      })}
    </div>
  );
}

/** Compatibility wrapper so app composition can use a provider-like boundary. */
export function ToastProvider({ children }) {
  return <>{children}<ToastStack /></>;
}
