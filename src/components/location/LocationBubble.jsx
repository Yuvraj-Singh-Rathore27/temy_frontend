import { memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, MapPin, Navigation, Radio, X } from 'lucide-react';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { formatTime } from '../../utils/format.js';
import { directionsUrl, formatAccuracy, googleMapsUrl } from '../../utils/location.js';
import { cn } from '../../utils/misc.js';
import { LocationMap } from './LocationMap.jsx';

/** Re-render every 30 s so "live until" turns into "ended" on time. */
function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** Map preview of a shared (or live) location inside a bubble. */
export const LocationBubble = memo(function LocationBubble({ message, mine }) {
  const { stopLiveLocation } = useChatActions();
  const { location } = message;
  const now = useNow(location.active);
  const [viewerOpen, setViewerOpen] = useState(false);
  const active = location.active && (!location.liveUntil || new Date(location.liveUntil).getTime() > now);

  return (
    <div className="w-[min(17rem,70vw)]">
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        className="relative block w-full overflow-hidden rounded-xl"
        aria-label="Open map"
      >
        <LocationMap {...location} live={active} className="pointer-events-none h-36 w-full" />
      </button>
      <div className={cn('mt-1.5 flex items-start gap-2 text-xs', mine ? 'text-white/85' : 'text-ink-muted')}>
        {location.live ? (
          <Radio className={cn('mt-0.5 size-3.5 shrink-0', active ? 'text-danger' : '')} aria-hidden />
        ) : (
          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className={cn('font-medium', mine ? 'text-white' : 'text-ink')}>
            {location.live ? (active ? 'Live location' : 'Live location ended') : 'Location'}
          </p>
          {location.live && active && location.liveUntil && <p>Until {formatTime(location.liveUntil)}</p>}
          {location.live && active && location.updatedAt && <p>Updated {formatTime(location.updatedAt)}</p>}
        </div>
        <a
          href={googleMapsUrl(location)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn('flex shrink-0 items-center gap-1 font-medium underline-offset-2 hover:underline', mine ? 'text-white' : 'text-brand-600')}
        >
          Google Maps <ExternalLink className="size-3" />
        </a>
      </div>
      {mine && active && message.id && (
        <button
          type="button"
          onClick={() => stopLiveLocation(message.id)}
          className="mt-1.5 w-full rounded-full bg-white/20 py-1.5 text-xs font-semibold text-white hover:bg-white/30"
        >
          Stop sharing
        </button>
      )}
      {viewerOpen && <LocationViewer location={location} live={active} onClose={() => setViewerOpen(false)} />}
    </div>
  );
});

/** Full-screen interactive map with links to Google Maps. */
function LocationViewer({ location, live, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label="Location">
      <header className="flex items-center gap-2 border-b border-line px-2 py-2">
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2.5 text-ink-soft hover:bg-surface-sunken">
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{live ? 'Live location' : 'Location'}</p>
          <p className="text-xs text-ink-muted">
            {location.latitude}, {location.longitude} {location.accuracy != null && `· ${formatAccuracy(location.accuracy)}`}
          </p>
        </div>
      </header>
      <LocationMap {...location} live={live} interactive zoom={16} className="min-h-0 flex-1" />
      <div className="safe-bottom flex gap-2 border-t border-line p-3">
        <a
          href={googleMapsUrl(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-control border border-line py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-muted"
        >
          <ExternalLink className="size-4" /> Open in Google Maps
        </a>
        <a
          href={directionsUrl(location)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-control bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-strong"
        >
          <Navigation className="size-4" /> Directions
        </a>
      </div>
    </div>,
    document.body,
  );
}
