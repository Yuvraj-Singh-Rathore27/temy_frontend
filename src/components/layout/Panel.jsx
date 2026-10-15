import { useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { cn } from '../../utils/misc.js';
import { IconButton } from '../ui/Button.jsx';

/**
 * Full-height side panel that covers its positioned parent (WhatsApp-style
 * drawers for "Profile" and "Contact info"). Closes on Escape.
 */
export function Panel({ title, onClose, closeIcon = 'back', className, children }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section
      role="dialog"
      aria-label={title}
      className={cn('absolute inset-0 z-20 flex animate-fade-in flex-col bg-surface-muted', className)}
    >
      <header className="flex items-center gap-2 border-b border-line bg-surface px-2 py-2.5">
        <IconButton icon={closeIcon === 'back' ? ArrowLeft : X} label="Close" onClick={onClose} />
        <h2 className="text-message font-semibold text-ink">{title}</h2>
      </header>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

/** White card section inside a panel. */
export function PanelSection({ title, children, className }) {
  return (
    <div className={cn('border-b border-line bg-surface px-gutter py-4', className)}>
      {title && <h3 className="mb-3 text-xs font-medium tracking-wide text-brand-700 uppercase">{title}</h3>}
      {children}
    </div>
  );
}
