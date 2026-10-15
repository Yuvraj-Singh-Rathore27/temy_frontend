import { AlertCircle, RotateCw, X } from 'lucide-react';
import { cn } from '../../utils/misc.js';
import { Button } from './Button.jsx';

/** Centered illustration + text for empty lists and screens. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon className="size-7" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Inline error with optional retry / dismiss. */
export function ErrorState({ message, onRetry, onDismiss, className, compact = false }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-control border border-red-200 bg-danger-soft text-sm text-red-800 dark:border-red-900 dark:text-red-200',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <p className="flex-1">{message}</p>
      {onRetry && (
        <Button size="sm" variant="ghost" icon={RotateCw} onClick={onRetry} className="-my-1 h-7 text-red-800 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-950">
          Retry
        </Button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Shimmering placeholder rows while lists load. */
export function ListSkeleton({ rows = 6 }) {
  return (
    <ul className="space-y-1 p-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex animate-pulse items-center gap-3 rounded-control px-3 py-3">
          <div className="size-11 rounded-full bg-surface-sunken" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 rounded bg-surface-sunken" />
            <div className="h-3 w-3/4 rounded bg-surface-sunken" />
          </div>
        </li>
      ))}
    </ul>
  );
}
