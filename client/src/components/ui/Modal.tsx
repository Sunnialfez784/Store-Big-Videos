import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-5xl' };

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button className="absolute inset-0 cursor-default" aria-label="Close dialog" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`surface relative max-h-[92vh] w-full overflow-y-auto rounded-t-card sm:rounded-card ${SIZES[size]}`}
      >
        {title && (
          <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-mist-200 bg-mist-50 px-5 py-3.5 dark:border-ink-700 dark:bg-ink-800">
            <h2 className="truncate font-display text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="muted rounded p-1 hover:text-ink-900 dark:hover:text-mist-50" aria-label="Close">
              <X size={18} />
            </button>
          </header>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
