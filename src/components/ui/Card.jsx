import { cn } from '../../utils/misc.js';

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('rounded-card border border-line bg-surface shadow-card', className)} {...props}>
      {children}
    </div>
  );
}
