import { useCallback, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { conversationsApi } from '../../api/endpoints.js';
import { formatDuration } from '../../utils/media.js';
import { cn } from '../../utils/misc.js';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { ErrorState } from '../ui/States.jsx';
import { AudioPlayer } from './AudioPlayer.jsx';
import { FileCard } from './FileCard.jsx';
import { MediaViewer } from './MediaViewer.jsx';
import { SecureImage } from './SecureMedia.jsx';

const TABS = [
  { id: 'media', label: 'Media' },
  { id: 'files', label: 'Files' },
  { id: 'audio', label: 'Audio' },
];

/** Everything shared in a chat, by type, newest first, with "load more". */
export function MediaGallery({ conversationId, me, peerName }) {
  const [tab, setTab] = useState('media');
  const [state, setState] = useState({ status: 'loading', items: [], hasMore: false, error: null });
  const [viewerIndex, setViewerIndex] = useState(null);

  const load = useCallback(
    async (before) => {
      setState((s) => ({ ...s, status: before ? 'more' : 'loading', error: null, items: before ? s.items : [] }));
      try {
        const { items, hasMore } = await conversationsApi.attachments(conversationId, { type: tab, before });
        setState((s) => ({ status: 'ready', items: before ? [...s.items, ...items] : items, hasMore, error: null }));
      } catch (error) {
        setState((s) => ({ ...s, status: 'error', error: error.message }));
      }
    },
    [conversationId, tab],
  );

  useEffect(() => {
    load();
  }, [load]);

  const { items } = state;
  const viewerItems = items.map((item) => ({ ...item, senderName: item.senderId === me ? 'You' : (item.senderName ?? peerName) }));

  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-control bg-surface-sunken p-1" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors',
              tab === id ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink-muted hover:text-ink-soft',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {state.status === 'loading' ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : state.status === 'error' && items.length === 0 ? (
        <ErrorState message={state.error} onRetry={() => load()} compact />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No {tab === 'media' ? 'photos or videos' : tab} shared yet.</p>
      ) : tab === 'media' ? (
        <div className="grid grid-cols-3 gap-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setViewerIndex(index)}
              className="relative aspect-square overflow-hidden rounded-md bg-surface-sunken"
              aria-label={item.kind === 'video' ? 'Play video' : 'Open photo'}
            >
              <SecureImage url={item.kind === 'video' ? item.thumbnailUrl : item.url} className="size-full object-cover" loading="lazy" />
              {item.kind === 'video' && (
                <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/60 px-1 text-2xs text-white">
                  <Play className="size-2.5 fill-current" /> {formatDuration(item.durationMs ?? 0)}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>{tab === 'audio' ? <AudioPlayer attachment={item} /> : <FileCard attachment={item} />}</li>
          ))}
        </ul>
      )}

      {state.hasMore && (
        <Button variant="secondary" size="sm" fullWidth className="mt-3" loading={state.status === 'more'} onClick={() => load(items[items.length - 1]?.id)}>
          Load more
        </Button>
      )}

      {viewerIndex != null && <MediaViewer items={viewerItems} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />}
    </div>
  );
}
