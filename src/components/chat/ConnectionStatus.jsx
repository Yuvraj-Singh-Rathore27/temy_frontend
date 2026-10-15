import { Loader2, WifiOff } from 'lucide-react';
import { cn } from '../../utils/misc.js';

const LABELS = {
  connected: { text: 'Online', dot: 'bg-online' },
  connecting: { text: 'Connecting…', dot: 'bg-warning' },
  reconnecting: { text: 'Reconnecting…', dot: 'bg-warning' },
  offline: { text: 'Offline', dot: 'bg-ink-faint' },
};

/** Small status line under the user's name. */
export function ConnectionPill({ status }) {
  const { text, dot } = LABELS[status] ?? LABELS.connecting;
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-muted" aria-live="polite">
      <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
      {text}
    </p>
  );
}

/** Banner above the chat when the realtime connection is down. */
export function ConnectionBanner({ status }) {
  if (status === 'connected' || status === 'connecting') return null;
  const offline = status === 'offline';
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium',
        offline ? 'bg-ink-soft text-white' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
      )}
    >
      {offline ? <WifiOff className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
      {offline
        ? 'You are offline. Messages will be sent when you reconnect.'
        : 'Connection lost. Reconnecting… Messages will be sent when you reconnect.'}
    </div>
  );
}
