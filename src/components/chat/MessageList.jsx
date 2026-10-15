import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, MessageCircleHeart } from 'lucide-react';
import { useChatActions, useThread } from '../../chat/ChatContext.jsx';
import { formatDayLabel, isSameDay } from '../../utils/format.js';
import { cn } from '../../utils/misc.js';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { EmptyState, ErrorState } from '../ui/States.jsx';
import { MessageBubble } from './MessageBubble.jsx';
import { TypingBubble } from './TypingIndicator.jsx';
import { EncryptionNotice } from './Encryption.jsx';

const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 150;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const FLOATING_DATE_MS = 1200; // the floating date fades this long after scrolling stops

/** Stable React key: optimistic and saved copies of a message share their clientId. */
const keyOf = (m) => m?.clientId ?? m?.id ?? null;

/** Consecutive messages from the same sender within a few minutes on the same day form a group. */
function sameGroup(a, b) {
  return (
    Boolean(a && b) &&
    !a.event &&
    !b.event &&
    a.senderId === b.senderId &&
    isSameDay(a.createdAt, b.createdAt) &&
    Math.abs(new Date(b.createdAt) - new Date(a.createdAt)) < GROUP_WINDOW_MS
  );
}

/**
 * `highlightId`: a message to scroll to and flash (reply quote, pin or search result).
 * `onOpenMenu(message, {x, y})`, `onJump(messageId)` and `onReact(message, emoji)` must be stable callbacks.
 */
export function MessageList({ conversationId, peerName, isGroupChat = false, isPeerTyping, highlightId, onOpenMenu, onJump, onReact, onOpenMedia, wallpaper }) {
  const { me, loadOlder, loadThread, retryMessage, discardMessage } = useChatActions();
  const thread = useThread(conversationId);
  const scrollRef = useRef(null);
  const atBottomRef = useRef(true);
  const prevRef = useRef({ firstKey: null, lastKey: null, scrollHeight: 0, count: 0 });
  const [showJump, setShowJump] = useState(false);
  const [floatingDay, setFloatingDay] = useState(null); // the day at the top while scrolling
  const floatingTimer = useRef(null);

  const { items, hasMore, loadingOlder } = thread;
  const firstKey = keyOf(items[0]);
  const lastItem = items[items.length - 1];
  const lastKey = keyOf(lastItem);

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setShowJump(false);
  }, []);

  // Keep the viewport stable: stick to the bottom for new messages, keep position when older ones are prepended.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevRef.current;
    if (prev.count === 0 && items.length > 0) {
      el.scrollTop = el.scrollHeight;
    } else if (firstKey !== prev.firstKey && lastKey === prev.lastKey) {
      el.scrollTop += el.scrollHeight - prev.scrollHeight; // older page prepended
    } else if (lastKey !== prev.lastKey) {
      if (atBottomRef.current || lastItem?.senderId === me) scrollToBottom(prev.count ? 'smooth' : 'auto');
      else setShowJump(true);
    }
    prevRef.current = { firstKey, lastKey, scrollHeight: el.scrollHeight, count: items.length };
  }, [firstKey, lastKey, items.length, lastItem, me, scrollToBottom]);

  // Bring a highlighted message into view (it is loaded by the caller first).
  useEffect(() => {
    if (!highlightId) return;
    const el = scrollRef.current?.querySelector(`[data-message-id="${highlightId}"]`);
    if (!el) return;
    atBottomRef.current = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightId, items.length]);

  // The typing bubble appearing at the bottom shouldn't hide the latest message.
  useEffect(() => {
    if (isPeerTyping && atBottomRef.current) scrollToBottom('smooth');
  }, [isPeerTyping, scrollToBottom]);

  /**
   * One floating date for the day at the top of the view (like WhatsApp), instead of
   * sticky separators that pile up. Hidden while that day's own separator is on screen
   * at the top, and a moment after scrolling stops.
   */
  const updateFloatingDay = useCallback(() => {
    const el = scrollRef.current;
    const top = el.getBoundingClientRect().top;
    let label = null;
    let separatorNearTop = false;
    for (const separator of el.querySelectorAll('[data-day-label]')) {
      const offset = separator.getBoundingClientRect().top - top;
      if (offset <= 8) {
        label = separator.dataset.dayLabel;
        separatorNearTop = offset > -44; // its own separator is still visible at the top
      } else {
        separatorNearTop ||= offset < 44; // or the next day's separator is about to reach it
        break;
      }
    }
    setFloatingDay(separatorNearTop || el.scrollTop < 8 ? null : label);
    clearTimeout(floatingTimer.current);
    floatingTimer.current = setTimeout(() => setFloatingDay(null), FLOATING_DATE_MS);
  }, []);

  useEffect(() => () => clearTimeout(floatingTimer.current), []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    updateFloatingDay();
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < NEAR_BOTTOM_PX;
    if (atBottomRef.current) setShowJump(false);
    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlder) loadOlder(conversationId);
  }, [hasMore, loadingOlder, loadOlder, conversationId, updateFloatingDay]);

  const retryLoad = useCallback(() => loadThread(conversationId), [loadThread, conversationId]);
  const retryOlder = useCallback(() => loadOlder(conversationId), [loadOlder, conversationId]);
  const jumpToBottom = useCallback(() => scrollToBottom('smooth'), [scrollToBottom]);

  if (thread.status === 'loading' && items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" label="Loading messages" />
      </div>
    );
  }
  if (thread.status === 'error' && items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <ErrorState message={thread.error} onRetry={retryLoad} />
      </div>
    );
  }

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', wallpaper?.className)} style={wallpaper?.style}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4 sm:px-gutter-lg"
        role="log"
        aria-live="polite"
        aria-label={`Messages with ${peerName}`}
      >
        <div className="mx-auto flex max-w-3xl flex-col">
          {loadingOlder && (
            <div className="flex justify-center py-2">
              <Spinner size="sm" label="Loading older messages" />
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <>
              <EncryptionNotice className="pt-3 text-center" />
              <p className="py-3 text-center text-xs text-ink-faint">This is the beginning of your conversation.</p>
            </>
          )}
          {thread.error && items.length > 0 && <ErrorState message={thread.error} compact onRetry={retryOlder} className="mb-2" />}

          {items.length === 0 ? (
            <>
              <EncryptionNotice className="pt-3 text-center" />
              <EmptyState
              icon={MessageCircleHeart}
              title={isGroupChat ? `Say hi to ${peerName}` : `Say hi to ${peerName.split(' ')[0]}`}
              description={isGroupChat ? 'Messages here are seen by everyone in the group.' : 'Messages you send here are private between the two of you.'}
              className="my-auto"
            />
            </>
          ) : (
            items.map((message, index) => {
              const prev = items[index - 1];
              const newDay = !prev || !isSameDay(prev.createdAt, message.createdAt);
              return (
                <Fragment key={keyOf(message)}>
                  {newDay && <DaySeparator date={message.createdAt} />}
                  <MessageBubble
                    message={message}
                    me={me}
                    peerName={peerName}
                    isGroupChat={isGroupChat}
                    groupedWithPrev={!newDay && sameGroup(prev, message)}
                    groupedWithNext={sameGroup(message, items[index + 1])}
                    highlighted={highlightId != null && message.id === highlightId}
                    onRetry={retryMessage}
                    onDiscard={discardMessage}
                    onOpenMenu={onOpenMenu}
                    onJump={onJump}
                    onReact={onReact}
                    onOpenMedia={onOpenMedia}
                  />
                </Fragment>
              );
            })
          )}
          {isPeerTyping && <TypingBubble name={peerName} />}
        </div>
      </div>

      {floatingDay && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex animate-fade-in justify-center" aria-hidden>
          <span className="rounded-full border border-line bg-surface/90 px-3 py-1 text-2xs font-medium text-ink-muted shadow-sm backdrop-blur">
            {floatingDay}
          </span>
        </div>
      )}

      {showJump && (
        <Button
          size="sm"
          variant="secondary"
          icon={ArrowDown}
          onClick={jumpToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-pop"
        >
          New messages
        </Button>
      )}
    </div>
  );
}

const DaySeparator = memo(function DaySeparator({ date }) {
  const label = formatDayLabel(date);
  return (
    <div className="my-3 flex justify-center" data-day-label={label}>
      <span className="rounded-full border border-line bg-surface/90 px-3 py-1 text-2xs font-medium text-ink-muted shadow-sm backdrop-blur">
        {label}
      </span>
    </div>
  );
});
