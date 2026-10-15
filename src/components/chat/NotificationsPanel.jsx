import { useCallback, useEffect, useState } from 'react';
import { AtSign, BellOff, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../api/endpoints.js';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { formatListTime } from '../../utils/format.js';
import { cn } from '../../utils/misc.js';
import { Panel } from '../layout/Panel.jsx';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { EmptyState, ErrorState } from '../ui/States.jsx';

const TEXT = { mention: 'mentioned you', contact_added: 'added you as a contact' };

/** 🔔 list: mentions and "added you as a contact". Opening it marks everything read. */
export function NotificationsPanel({ onClose }) {
  const { markNotificationsRead } = useChatActions();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', items: [], hasMore: false, error: null });

  const load = useCallback(async (before) => {
    setState((s) => ({ ...s, status: before ? 'more' : 'loading' }));
    try {
      const { notifications, hasMore } = await notificationsApi.list({ before });
      setState((s) => ({ status: 'ready', items: before ? [...s.items, ...notifications] : notifications, hasMore, error: null }));
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', error: error.message }));
    }
  }, []);

  useEffect(() => {
    load().then(() => markNotificationsRead().catch(() => {}));
  }, [load, markNotificationsRead]);

  const open = (notification) => {
    onClose();
    if (notification.conversationId) {
      navigate(`/c/${notification.conversationId}`, notification.messageId ? { state: { jumpTo: notification.messageId } } : undefined);
    }
  };

  return (
    <Panel title="Notifications" onClose={onClose}>
      {state.status === 'loading' ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : state.status === 'error' && state.items.length === 0 ? (
        <ErrorState message={state.error} onRetry={() => load()} compact className="m-3" />
      ) : state.items.length === 0 ? (
        <EmptyState icon={BellOff} title="No notifications" description="Mentions and new contacts will show up here." />
      ) : (
        <ul className="bg-surface">
          {state.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={cn('flex w-full items-start gap-3 border-b border-line px-gutter py-3 text-left hover:bg-surface-muted', !n.read && 'bg-brand-50/60')}
              >
                <div className="relative">
                  <Avatar user={n.actor} size="sm" />
                  <span className="absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-surface">
                    {n.type === 'mention' ? <AtSign className="size-2.5" /> : <UserPlus className="size-2.5" />}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-semibold">{n.actor?.name ?? 'Someone'}</span> {TEXT[n.type]}
                  </p>
                  {n.preview && <p className="mt-0.5 line-clamp-2 text-sm break-words text-ink-muted">{n.preview}</p>}
                  <time className="text-2xs text-ink-faint">{formatListTime(n.createdAt)}</time>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.hasMore && (
        <div className="p-3">
          <Button variant="secondary" size="sm" fullWidth loading={state.status === 'more'} onClick={() => load(state.items.at(-1)?.id)}>
            Load more
          </Button>
        </div>
      )}
    </Panel>
  );
}
