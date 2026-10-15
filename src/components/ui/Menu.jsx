import { useCallback, useRef, useState } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { cn } from '../../utils/misc.js';
import { IconButton } from './Button.jsx';

/** Icon-triggered dropdown. `items`: [{ label, icon, onClick, danger, hidden }] */
export function Menu({ icon, label, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  return (
    <div className="relative" ref={ref}>
      <IconButton icon={icon} label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-30 mt-1 min-w-52 animate-fade-in rounded-control border border-line bg-surface p-1 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items
            .filter((item) => !item.hidden)
            .map(({ label: itemLabel, icon: Icon, onClick, danger }) => (
              <button
                key={itemLabel}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onClick();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  danger ? 'text-danger hover:bg-danger-soft' : 'text-ink-soft hover:bg-surface-sunken',
                )}
              >
                {Icon && <Icon className="size-4" aria-hidden />}
                {itemLabel}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
