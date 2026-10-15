import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import { cn } from '../../utils/misc.js';

const LABELS = { pending: 'Sending', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Not sent' };

/** Tick icon for one of my messages: clock → ✓ sent → ✓✓ delivered → blue ✓✓ read. */
export function MessageStatus({ status, className, tone = 'onBrand' }) {
  const base = tone === 'onBrand' ? 'text-white/60' : 'text-ink-faint';
  const props = { className: cn('size-3.5 shrink-0', className), 'aria-label': LABELS[status], role: 'img' };
  switch (status) {
    case 'pending':
      return <Clock {...props} className={cn(props.className, base)} />;
    case 'sent':
      return <Check {...props} className={cn(props.className, base)} />;
    case 'delivered':
      return <CheckCheck {...props} className={cn(props.className, base)} />;
    case 'read':
      // Thicker and in a colour chosen per accent, so "read" never blends into my bubble or looks like "delivered".
      return <CheckCheck {...props} strokeWidth={2.75} className={cn(props.className, tone === 'onBrand' ? 'text-read-on-bubble' : 'text-read')} />;
    case 'failed':
      return <AlertCircle {...props} className={cn(props.className, 'text-danger')} />;
    default:
      return null;
  }
}
