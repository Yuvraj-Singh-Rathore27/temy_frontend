import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/misc.js';
import { IconButton } from './Button.jsx';

/**
 * Accessible dialog: rendered in a portal, closes on Escape or backdrop click,
 * moves focus inside on open and restores it on close.
 */
export function Modal({ title, description, onClose, children, footer, className }) {
  const titleId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    panelRef.current?.querySelector('button, [href], input, textarea, select')?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[85dvh] w-full animate-fade-in flex-col rounded-t-card bg-surface shadow-pop sm:max-w-md sm:rounded-card',
          className,
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="flex-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} className="-mt-1 -mr-2" />
        </header>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <footer className="safe-bottom flex justify-end gap-2 border-t border-line px-5 pt-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
