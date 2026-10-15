import { cn } from '../../utils/misc.js';

const SIZES = { sm: 'size-4 border-2', md: 'size-6 border-2', lg: 'size-10 border-[3px]' };

export function Spinner({ size = 'md', className, label = 'Loading' }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-block animate-spin rounded-full border-current border-r-transparent text-brand-600', SIZES[size], className)}
    />
  );
}

export function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div className="app-height flex flex-col items-center justify-center gap-3 text-ink-muted">
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
