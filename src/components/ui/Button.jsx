import { cn } from '../../utils/misc.js';
import { Spinner } from './Spinner.jsx';

const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-strong active:bg-brand-strong shadow-sm',
  secondary: 'bg-surface text-ink-soft border border-line hover:bg-surface-muted hover:border-line-strong',
  ghost: 'text-ink-soft hover:bg-surface-sunken',
  danger: 'bg-danger text-white hover:bg-red-700 shadow-sm',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon: Icon,
  fullWidth,
  className,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-medium transition-colors select-none',
        'focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size="sm" className="text-current" /> : Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      {children}
    </button>
  );
}

/** Square icon-only button; `label` is required for screen readers. */
export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className, ...props }) {
  const dims = { sm: 'size-8', md: 'size-10', lg: 'size-12' }[size];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        dims,
        className,
      )}
      {...props}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
