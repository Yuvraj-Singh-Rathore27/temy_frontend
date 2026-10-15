import { useCallback, useEffect, useState } from 'react';
import { LocateFixed, MapPinOff, Radio, Send } from 'lucide-react';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { formatAccuracy, getCurrentPosition, LIVE_DURATIONS, locationPermission } from '../../utils/location.js';
import { cn } from '../../utils/misc.js';
import { Button } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { LocationMap } from './LocationMap.jsx';

/** Share my current location, or a live location for a chosen time. */
export function LocationDialog({ conversationId, replyTo, onClose, onSent }) {
  const { sendLocation } = useChatActions();
  const [state, setState] = useState({ status: 'locating', coords: null, error: null, permission: 'unknown' });
  const [liveMinutes, setLiveMinutes] = useState(60);

  const locate = useCallback(async () => {
    setState((s) => ({ ...s, status: 'locating', error: null }));
    const permission = await locationPermission();
    try {
      const coords = await getCurrentPosition();
      setState({ status: 'ready', coords, error: null, permission: 'granted' });
    } catch (error) {
      setState({ status: 'error', coords: null, error: error.message, permission });
    }
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const send = (live) => {
    sendLocation(conversationId, state.coords, { liveMinutes: live ? liveMinutes : undefined, replyTo });
    onSent?.();
    onClose();
  };

  return (
    <Modal title="Share location" onClose={onClose} className="sm:max-w-lg">
      {state.status === 'locating' && (
        <div className="flex flex-col items-center gap-3 py-12 text-sm text-ink-muted">
          <Spinner />
          Finding your location…
          <span className="text-xs text-ink-faint">Your browser may ask for permission.</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
            <MapPinOff className="size-7" aria-hidden />
          </span>
          <p className="max-w-sm text-sm text-ink-soft">{state.error}</p>
          {state.permission === 'denied' && (
            <p className="max-w-sm text-xs text-ink-muted">After allowing access, come back and press Try again.</p>
          )}
          <Button variant="secondary" icon={LocateFixed} onClick={locate}>
            Try again
          </Button>
        </div>
      )}

      {state.status === 'ready' && (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-card border border-line">
            <LocationMap {...state.coords} interactive zoom={16} className="h-56 w-full" />
          </div>
          <p className="flex items-center justify-between text-xs text-ink-muted">
            <span>
              {state.coords.latitude}, {state.coords.longitude}
            </span>
            <span>Accuracy {formatAccuracy(state.coords.accuracy)}</span>
          </p>

          <Button fullWidth size="lg" icon={Send} onClick={() => send(false)}>
            Send your current location
          </Button>

          <div className="rounded-card border border-line p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Radio className="size-4 text-danger" aria-hidden /> Share live location
            </p>
            <p className="mt-1 text-xs text-ink-muted">Your position updates in this chat while you move, until the time runs out or you stop.</p>
            <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Live location duration">
              {LIVE_DURATIONS.map(({ minutes, label }) => (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={liveMinutes === minutes}
                  onClick={() => setLiveMinutes(minutes)}
                  className={cn(
                    'rounded-control border px-2 py-2 text-sm transition-colors',
                    liveMinutes === minutes ? 'border-brand-400 bg-brand-50 font-medium text-brand-800' : 'border-line text-ink-soft hover:bg-surface-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button fullWidth variant="secondary" className="mt-3" onClick={() => send(true)}>
              Share live for {LIVE_DURATIONS.find((d) => d.minutes === liveMinutes).label}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
