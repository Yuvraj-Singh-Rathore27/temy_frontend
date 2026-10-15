import { memo } from 'react';
import { BellOff, MessagesSquare } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { formatListTime } from '../../utils/format.js';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState, ErrorState, ListSkeleton } from '../ui/States.jsx';
import { MessageStatus } from './MessageStatus.jsx';
import { UnreadBadge } from '../ui/Badge.jsx';
import { ActivityLabel } from './TypingIndicator.jsx';
import { messagePreview } from '../../utils/media.js';
import { chatAvatar, chatTitle, eventText, isGroup } from '../../utils/conversation.js';

export function ConversationList({ conversations, filter, onFindPeople }) {
  const { conversationsStatus, conversationsError, typing } = useChatState();
  const { loadConversations } = useChatActions();

  if (conversationsStatus === 'loading' || conversationsStatus === 'idle') return <ListSkeleton />;
  if (conversationsStatus === 'error') {
    return (
      <div className="p-3">
        <ErrorState message={conversationsError} onRetry={loadConversations} />
      </div>
    );
  }
  if (conversations.length === 0) {
    return filter ? (
      <EmptyState title="No matches" description={`No conversations match “${filter}”.`} />
    ) : (
      <EmptyState
        icon={MessagesSquare}
        title="No conversations yet"
        description="Add someone to your contacts and say hello."
        action={<Button onClick={onFindPeople}>Find people</Button>}
      />
    );
  }

  return (
    <ul className="space-y-0.5 p-2">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <ConversationItem conversation={conversation} activity={currentActivity(typing[conversation.id])} />
        </li>
      ))}
    </ul>
  );
}

/** 'typing' | 'recording' | undefined for a conversation's typers. */
const currentActivity = (typers) => (typers ? Object.values(typers)[0] : undefined);

/** Memoized: re-renders only when this conversation object or its typing activity changes. */
const ConversationItem = memo(function ConversationItem({ conversation, activity }) {
  const { me } = useChatActions();
  const { lastMessage, unreadCount } = conversation;
  const group = isGroup(conversation);
  const mine = lastMessage?.senderId === me;
  const unread = unreadCount > 0;

  return (
    <NavLink
      to={`/c/${conversation.id}`}
      className={({ isActive }) =>
        cn('flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors', isActive ? 'bg-brand-50' : 'hover:bg-surface-muted')
      }
    >
      <Avatar user={chatAvatar(conversation)} showStatus={!group} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn('flex min-w-0 items-center gap-1 text-sm text-ink', unread ? 'font-semibold' : 'font-medium')}>
            <span className="truncate">{chatTitle(conversation)}</span>
            {conversation.mutedUntil && <BellOff className="size-3.5 shrink-0 text-ink-faint" aria-label="Muted" />}
          </p>
          <time className={cn('shrink-0 text-2xs', unread ? 'font-semibold text-brand-600' : 'text-ink-faint')}>
            {formatListTime(conversation.lastMessageAt ?? conversation.createdAt)}
          </time>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className={cn('flex min-w-0 flex-1 items-center gap-1 text-sm', unread ? 'text-ink-soft' : 'text-ink-muted')}>
            {activity ? (
              <ActivityLabel activity={activity} />
            ) : lastMessage ? (
              <>
                {mine && !lastMessage.event && <MessageStatus status={lastMessage.status} tone="muted" />}
                <span className="truncate">
                  {lastMessage.event
                    ? eventText(lastMessage, me)
                    : group && !mine
                      ? `${(lastMessage.senderName ?? 'Someone').split(' ')[0]}: ${messagePreview(lastMessage)}`
                      : messagePreview(lastMessage)}
                </span>
              </>
            ) : (
              <span className="truncate italic text-ink-faint">No messages yet</span>
            )}
          </p>
          {unread && <UnreadBadge count={unreadCount} />}
        </div>
      </div>
    </NavLink>
  );
});
