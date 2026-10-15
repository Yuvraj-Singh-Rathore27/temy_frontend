import { useId } from 'react';
import { cn } from '../../utils/misc.js';

/** Accessible on/off switch with a label and optional description. */
export function Switch({ label, description, checked, onChange, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cn('block text-sm font-medium', disabled ? 'text-ink-faint' : 'text-ink')}>
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-50',
          checked ? 'bg-brand-600' : 'bg-line-strong',
        )}
      >
        <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}
