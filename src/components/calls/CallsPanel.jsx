import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Trash2, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { callsApi } from '../../api/endpoints.js';
import { useCallActions } from '../../calls/CallContext.jsx';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { formatListTime } from '../../utils/format.js';
import { callText, isMissedCall } from '../../utils/conversation.js';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button, IconButton } from '../ui/Button.jsx';
import { EmptyState, ErrorState, ListSkeleton } from '../ui/States.jsx';
import { useToast } from '../ui/Toast.jsx';

/** Sidebar "Calls" tab: my call history, newest first, with call-back buttons. */
export function CallsPanel({ query = '' }) {
  const { me, subscribe } = useChatActions();
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', calls: [], hasMore: false, error: null });
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => {
    callsApi
      .history()
      .then(({ calls, hasMore }) => setState({ status: 'ready', calls, hasMore, error: null }))
      .catch((error) => setState((s) => ({ ...s, status: 'error', error: error.message })));
  }, []);

  useEffect(() => {
    load();
    // A call just finished (here or on another device): show it.
    return subscribe('call:ended', load);
  }, [load, subscribe]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { calls, hasMore } = await callsApi.history(state.calls.at(-1)?.id);
      setState((s) => ({ ...s, calls: [...s.calls, ...calls], hasMore }));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = useCallback(
    (id) => {
      setState((s) => ({ ...s, calls: s.calls.filter((c) => c.id !== id) }));
      callsApi.hide([id]).catch((error) => {
        toast.error(error.message);
        load();
      });
    },
    [toast, load],
  );

  const clearAll = () => {
    if (!window.confirm('Clear your whole call history? This only affects you.')) return;
    setState((s) => ({ ...s, calls: [], hasMore: false }));
    callsApi.clear().catch((error) => {
      toast.error(error.message);
      load();
    });
  };

  const term = query.trim().toLowerCase();
  const visible = useMemo(
    () => (term ? state.calls.filter((call) => call.peer.name.toLowerCase().includes(term)) : state.calls),
    [state.calls, term],
  );

  if (state.status === 'loading') return <ListSkeleton rows={5} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={load} className="m-gutter" />;
  if (state.calls.length === 0) {
    return <EmptyState icon={Phone} title="No calls yet" description="Open a chat and tap the phone or camera button to call someone." className="py-12" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between px-gutter pt-3 pb-1">
        <h3 className="text-2xs font-semibold tracking-wider text-ink-faint uppercase">Recent</h3>
        <button type="button" onClick={clearAll} className="text-xs font-medium text-ink-muted hover:text-danger">
          Clear all
        </button>
      </div>
      <ul>
        {visible.map((call) => (
          <li key={call.id}>
            <CallRow call={call} me={me} onRemove={remove} />
          </li>
        ))}
      </ul>
      {term && visible.length === 0 && <p className="px-gutter py-6 text-center text-sm text-ink-muted">No calls with "{query.trim()}"</p>}
      {state.hasMore && !term && (
        <div className="flex justify-center py-3">
          <Button size="sm" variant="ghost" loading={loadingMore} onClick={loadMore}>
            Show older calls
          </Button>
        </div>
      )}
    </div>
  );
}

const CallRow = memo(function CallRow({ call, me, onRemove }) {
  const { startCall } = useCallActions();
  const navigate = useNavigate();
  const callerId = call.direction === 'outgoing' ? me : call.peer.id;
  const data = { type: call.type, status: call.status, durationSec: call.durationSec, callerId };
  const missed = isMissedCall(data, me);
  const DirectionIcon = missed ? PhoneMissed : call.direction === 'outgoing' ? PhoneOutgoing : PhoneIncoming;
  const CallIcon = call.type === 'video' ? Video : Phone;

  return (
    <div className="group flex items-center gap-3 px-gutter py-2.5 hover:bg-surface-muted">
      <button
        type="button"
        onClick={() => navigate(`/c/${call.conversationId}`)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
        aria-label={`${call.peer.name}: ${callText(data, me)}, open chat`}
      >
        <Avatar user={call.peer} />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', missed ? 'text-danger' : 'text-ink')}>{call.peer.name}</p>
          <p className="flex items-center gap-1 truncate text-xs text-ink-muted">
            <DirectionIcon className={cn('size-3.5 shrink-0', missed ? 'text-danger' : 'text-success')} aria-hidden />
            {callText(data, me)} · {formatListTime(call.createdAt)}
          </p>
        </div>
      </button>
      <IconButton
        icon={Trash2}
        label="Remove from call history"
        size="sm"
        onClick={() => onRemove(call.id)}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      />
      <IconButton
        icon={CallIcon}
        label={`${call.type === 'video' ? 'Video' : 'Voice'} call ${call.peer.name}`}
        onClick={() => startCall({ conversationId: call.conversationId, peer: call.peer, type: call.type })}
        className="text-brand-600"
      />
    </div>
  );
});
