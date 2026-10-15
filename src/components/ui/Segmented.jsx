import { cn } from '../../utils/misc.js';

/** Row of mutually exclusive options (a radio group styled as a segmented control). */
export function Segmented({ label, options, value, onChange }) {
  return (
    <div className="py-2">
      <p className="mb-1.5 text-sm font-medium text-ink">{label}</p>
      <div className="flex gap-1 rounded-control bg-surface-sunken p-1" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => value !== option.value && onChange(option.value)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-sm transition-colors',
              value === option.value ? 'bg-surface font-medium text-brand-700 shadow-sm' : 'text-ink-muted hover:text-ink-soft',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
