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
const LOAD_NEWER_PX = 150;
// A long scroll back would otherwise keep every loaded message in the page (slower with each page).
// At most this many are rendered; scrolling past either end slides the slice by WINDOW_STEP.
const MAX_RENDERED = 300;
const WINDOW_STEP = 100;
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
  const prevRef = useRef({ firstKey: null, lastKey: null, firstShownKey: null, scrollHeight: 0, count: 0 });
  const [showJump, setShowJump] = useState(false);
  const [floatingDay, setFloatingDay] = useState(null); // the day at the top while scrolling
  const floatingTimer = useRef(null);
  // The rendered slice of the thread, by message key. endKey null: up to the latest message.
  const [range, setRange] = useState({ startKey: null, endKey: null });
  const anchorRef = useRef(null); // { id, top }: the first message in view, kept in place when the slice changes
  const toBottomRef = useRef(false); // scroll to the bottom once the slice reaches the latest message
  const askedOlderRef = useRef(false); // the user scrolled to the top for older messages: show them when they arrive
  const highlightedRef = useRef(null); // the highlighted message already scrolled to

  const { items, hasMore, loadingOlder } = thread;
  const firstKey = keyOf(items[0]);
  const lastItem = items[items.length - 1];
  const lastKey = keyOf(lastItem);

  const indexOfKey = (key) => (key == null ? -1 : items.findIndex((m) => keyOf(m) === key));
  let end = range.endKey == null ? items.length : indexOfKey(range.endKey) + 1;
  if (end <= 0) end = items.length; // that message is gone: back to the latest
  let start = indexOfKey(range.startKey);
  if (start < 0 || start >= end) start = Math.max(0, end - MAX_RENDERED);
  const live = end === items.length;
  const shown = items.slice(start, end);
  const firstShownKey = keyOf(shown[0]);
  const firstShownRef = useRef(null);
  firstShownRef.current = shown[0];

  /** Show items [from, to) of the thread. */
  const showRange = useCallback(
    (from, to) => setRange({ startKey: keyOf(items[from]), endKey: to >= items.length ? null : keyOf(items[to - 1]) }),
    [items],
  );

  /**
   * Remember where the first message in view is (binary search: messages are in order).
   * Layout offsets, not screen positions: a new bubble's fade-in moves it a few pixels.
   */
  const captureAnchor = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nodes = el.querySelectorAll('[data-message-id]');
    let lo = 0;
    let hi = nodes.length - 1;
    let found = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (nodes[mid].offsetTop + nodes[mid].offsetHeight > el.scrollTop) {
        found = nodes[mid];
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    anchorRef.current = found ? { id: found.dataset.messageId, top: found.offsetTop - el.scrollTop } : null;
  }, []);

  const scrollToBottom = useCallback(
    (behavior = 'auto') => {
      const el = scrollRef.current;
      if (!live) {
        // Far up in a long chat: bring the latest messages back first.
        toBottomRef.current = true;
        setRange({ startKey: null, endKey: null });
      } else if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior });
      }
      atBottomRef.current = true;
      setShowJump(false);
    },
    [live],
  );

  // Keep the viewport stable: stick to the bottom for new messages, keep the message in view
  // in place when messages are added or removed above it.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevRef.current;
    const prepended = firstKey !== prev.firstKey && lastKey === prev.lastKey;
    if (prev.count === 0 && items.length > 0) {
      el.scrollTop = el.scrollHeight;
    } else if (toBottomRef.current && live) {
      toBottomRef.current = false;
      el.scrollTop = el.scrollHeight;
    } else if (firstShownKey !== prev.firstShownKey) {
      const anchor = anchorRef.current;
      const node = anchor && el.querySelector(`[data-message-id="${anchor.id}"]`);
      if (node) el.scrollTop = node.offsetTop - anchor.top;
      else if (prepended) el.scrollTop += el.scrollHeight - prev.scrollHeight; // older page prepended
    }
    if (!prepended && lastKey !== prev.lastKey && prev.count) {
      if ((atBottomRef.current && live) || lastItem?.senderId === me) scrollToBottom('smooth');
      else setShowJump(true);
    }
    // An older page the user scrolled up for arrived (and they are still near the top): show it.
    if (prepended && askedOlderRef.current) {
      askedOlderRef.current = false;
      if (start > 0 && el.scrollTop < el.clientHeight) showRange(0, Math.min(end, MAX_RENDERED));
    }
    // At the latest messages with a slice that grew past the limit: drop the oldest.
    else if (live && atBottomRef.current && end - start > MAX_RENDERED + WINDOW_STEP) showRange(end - MAX_RENDERED, end);
    prevRef.current = { firstKey, lastKey, firstShownKey, scrollHeight: el.scrollHeight, count: items.length };
  }, [firstKey, lastKey, firstShownKey, items.length, lastItem, me, live, start, end, scrollToBottom, showRange]);

  // Bring a highlighted message into view (it is loaded by the caller first), once.
  useEffect(() => {
    if (!highlightId) {
      highlightedRef.current = null;
      return;
    }
    if (highlightedRef.current === highlightId) return;
    const index = items.findIndex((m) => m.id === highlightId);
    if (index < 0) return;
    atBottomRef.current = false;
    if (index < start || index >= end) {
      // Outside the rendered slice: move the slice there first (this runs again after).
      const from = Math.max(0, index - WINDOW_STEP);
      showRange(from, Math.min(items.length, from + MAX_RENDERED));
      highlightedRef.current = { movedTo: highlightId };
      return;
    }
    const el = scrollRef.current?.querySelector(`[data-message-id="${highlightId}"]`);
    if (!el) return;
    // After moving the slice the old position means nothing: go straight there (a smooth scroll
    // from it would pass the end of the slice and slide it away again).
    const moved = highlightedRef.current?.movedTo === highlightId;
    highlightedRef.current = highlightId;
    el.scrollIntoView({ block: 'center', behavior: moved ? 'auto' : 'smooth' });
  }, [highlightId, items, start, end, showRange]);

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
    // That day's separator may be above the rendered slice: the slice then starts on that day.
    if (label === null && firstShownRef.current) label = formatDayLabel(firstShownRef.current.createdAt);
    setFloatingDay(separatorNearTop || el.scrollTop < 8 ? null : label);
    clearTimeout(floatingTimer.current);
    floatingTimer.current = setTimeout(() => setFloatingDay(null), FLOATING_DATE_MS);
  }, []);

  useEffect(() => () => clearTimeout(floatingTimer.current), []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    updateFloatingDay();
    captureAnchor();
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = live && distance < NEAR_BOTTOM_PX;
    if (atBottomRef.current) setShowJump(false);
    if (el.scrollTop < LOAD_OLDER_PX) {
      if (start > 0) {
        const from = Math.max(0, start - WINDOW_STEP); // older messages already loaded
        showRange(from, Math.min(end, from + MAX_RENDERED));
      } else if (hasMore && !loadingOlder) {
        askedOlderRef.current = true;
        loadOlder(conversationId);
      }
    } else if (!live && distance < LOAD_NEWER_PX) {
      const to = Math.min(items.length, end + WINDOW_STEP);
      showRange(Math.max(start, to - MAX_RENDERED), to);
    } else if (atBottomRef.current && end - start > MAX_RENDERED + WINDOW_STEP) {
      showRange(end - MAX_RENDERED, end);
    }
  }, [hasMore, loadingOlder, loadOlder, conversationId, updateFloatingDay, captureAnchor, live, start, end, items.length, showRange]);

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
        // The position is kept by the effect above; the browser's own scroll anchoring (Chrome, Firefox) would move it twice.
        // `relative`: message offsets are measured from here.
        className="scrollbar-thin relative flex-1 overflow-y-auto px-3 py-4 [overflow-anchor:none] sm:px-gutter-lg"
        role="log"
        aria-live="polite"
        aria-label={`Messages with ${peerName}`}
      >
        <div className="mx-auto flex max-w-3xl flex-col">
          {!hasMore && items.length > 0 && start === 0 && (
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
            shown.map((message, offset) => {
              const index = start + offset;
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

      {/* Over the list, not in it: appearing and disappearing must not move the messages. */}
      {loadingOlder && (
        <div className="pointer-events-none absolute inset-x-0 top-12 z-20 flex justify-center">
          <span className="rounded-full border border-line bg-surface/90 p-1.5 shadow-sm backdrop-blur">
            <Spinner size="sm" label="Loading older messages" />
          </span>
        </div>
      )}

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
