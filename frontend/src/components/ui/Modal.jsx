// === filename: frontend/src/components/ui/Modal.jsx ===
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Focus-managed dialog surface with Escape and backdrop dismissal. */
export default function Modal({ open, title, onClose, children, size = 'normal' }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    panelRef.current?.querySelector('input,textarea,select,button')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = [...panelRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[href]')];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section ref={panelRef} className={`modal-panel ${size === 'wide' ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-action" onClick={onClose} aria-label="Close dialog"><X size={16} /></button></header><div className="modal-content">{children}</div></section></div>;
}
