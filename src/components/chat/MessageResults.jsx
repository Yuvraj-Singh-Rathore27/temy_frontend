import { memo, useEffect, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { messagesApi } from '../../api/endpoints.js';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatListTime } from '../../utils/format.js';
import { messagePreview } from '../../utils/media.js';
import { cn } from '../../utils/misc.js';
import { Panel } from '../layout/Panel.jsx';
import { inputClass } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { EmptyState, ErrorState } from '../ui/States.jsx';
import { chatTitle, isGroup } from '../../utils/conversation.js';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text with case-insensitive matches of `term` wrapped in <mark> (no HTML injection: React renders text). */
function Highlighted({ text, term }) {
  if (!term) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, 'ig'));
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={i} className="rounded bg-amber-200 px-0.5 text-black dark:bg-amber-400">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/** One message in a search/starred list. */
export const MessageResult = memo(function MessageResult({ message, title, term, onSelect }) {
  return (
    <button type="button" onClick={() => onSelect(message)} className="block w-full border-b border-line px-gutter py-3 text-left hover:bg-surface-muted">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        <time className="shrink-0 text-2xs text-ink-faint">{formatListTime(message.createdAt)}</time>
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm break-words text-ink-muted">
        <Highlighted text={messagePreview(message)} term={term} />
      </p>
    </button>
  );
});

/** Who sent `message`, from the viewer's point of view. */
export function useSenderLabel() {
  const { me } = useChatActions();
  const { conversations } = useChatState();
  return (message, { withChat = false } = {}) => {
    const conversation = conversations[message.conversationId];
    const sender = message.senderId === me ? 'You' : (message.senderName ?? conversation?.peer?.name ?? 'Unknown');
    if (!withChat || !conversation) return sender;
    if (isGroup(conversation)) return `${sender} · ${chatTitle(conversation)}`;
    return message.senderId === me ? `You → ${chatTitle(conversation)}` : sender;
  };
}

/** Server-side message search. Without `conversationId` it searches every chat. */
export function useMessageSearch(query, conversationId) {
  const term = useDebouncedValue(query.trim(), 300);
  const [state, setState] = useState({ status: 'idle', messages: [], error: null, term: '' });
  const typing = query.trim().length > 0;

  // The on-device part reads every saved text; start that during the debounce.
  useEffect(() => {
    if (typing) messagesApi.warmSearch();
  }, [typing]);

  useEffect(() => {
    if (term.length < 2) {
      setState({ status: 'idle', messages: [], error: null, term: '' });
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, status: 'loading' }));
    messagesApi
      .search(term, { conversationId, signal: controller.signal })
      .then(({ messages }) => setState({ status: 'ready', messages, error: null, term }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'error', messages: [], error: error.message, term });
      });
    return () => controller.abort();
  }, [term, conversationId]);

  return state;
}

/** "Search messages" inside one conversation. */
export function ChatSearchPanel({ conversationId, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const result = useMessageSearch(query, conversationId);
  const label = useSenderLabel();

  return (
    <Panel title="Search messages" onClose={onClose} closeIcon="close">
      <div className="border-b border-line bg-surface px-gutter py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in this chat"
            aria-label="Search in this chat"
            maxLength={100}
            className={cn(inputClass, 'h-10 pl-9')}
          />
        </div>
      </div>
      <SearchResults result={result} onSelect={onSelect} titleOf={(m) => label(m)} />
    </Panel>
  );
}

export function SearchResults({ result, onSelect, titleOf, idleHint = 'Type at least 2 characters to search.' }) {
  if (result.status === 'idle') return <p className="px-gutter py-6 text-center text-sm text-ink-muted">{idleHint}</p>;
  if (result.status === 'loading' && result.messages.length === 0) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }
  if (result.status === 'error') return <ErrorState message={result.error} compact className="m-3" />;
  if (result.messages.length === 0) {
    return <p className="px-gutter py-6 text-center text-sm text-ink-muted">No messages found for “{result.term}”.</p>;
  }
  return (
    <div className="bg-surface">
      {result.messages.map((message) => (
        <MessageResult key={message.id} message={message} title={titleOf(message)} term={result.term} onSelect={onSelect} />
      ))}
    </div>
  );
}

/** "Starred messages" across all chats. */
export function StarredPanel({ onClose, onSelect }) {
  const [state, setState] = useState({ status: 'loading', messages: [], error: null });
  const label = useSenderLabel();

  useEffect(() => {
    let cancelled = false;
    messagesApi
      .starred()
      .then(({ messages }) => !cancelled && setState({ status: 'ready', messages, error: null }))
      .catch((error) => !cancelled && setState({ status: 'error', messages: [], error: error.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel title="Starred messages" onClose={onClose}>
      {state.status === 'loading' ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : state.status === 'error' ? (
        <ErrorState message={state.error} compact className="m-3" />
      ) : state.messages.length === 0 ? (
        <EmptyState icon={Star} title="No starred messages" description="Star a message (right-click or long-press it) to find it here later." />
      ) : (
        <div className="bg-surface">
          {state.messages.map((message) => (
            <MessageResult key={message.id} message={message} title={label(message, { withChat: true })} onSelect={onSelect} />
          ))}
        </div>
      )}
    </Panel>
  );
}
