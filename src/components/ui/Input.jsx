import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../utils/misc.js';

export const inputClass = cn(
  'w-full rounded-control border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint',
  'transition-[border-color,box-shadow] outline-none focus:border-brand-400 focus:shadow-focus',
  'disabled:cursor-not-allowed disabled:bg-surface-muted',
);

/** Labelled text input with inline error and optional leading icon. */
export function Input({ label, error, hint, icon: Icon, className, inputClassName, type = 'text', id, ...props }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />}
        <input
          id={inputId}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            inputClass,
            'h-control',
            Icon && 'pl-9',
            isPassword && 'pr-10',
            error && 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgb(220_38_38/0.15)]',
            inputClassName,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint hover:text-ink-muted"
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
