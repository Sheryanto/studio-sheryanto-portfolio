import { useEffect, useRef, type ReactNode } from 'react';

/** Accessible modal built on the native <dialog> element (focus trap and Escape handling for free). */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} aria-labelledby="dialog-title">
      {open && (
        <div className="dialog-body">
          <h2 id="dialog-title" className="dialog-title">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
