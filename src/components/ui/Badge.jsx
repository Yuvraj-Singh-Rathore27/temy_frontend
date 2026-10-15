import { cn } from '../../utils/misc.js';

/** Brand-coloured count pill (unread messages). */
export function UnreadBadge({ count, className }) {
  return (
    <span
      className={cn(
        'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-2xs font-semibold text-white',
        className,
      )}
      aria-label={`${count} unread`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
