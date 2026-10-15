import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, UserMinus, UserPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usersApi } from '../../api/endpoints.js';
import { selectContacts } from '../../chat/chatReducer.js';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { formatLastSeen, formatListTime } from '../../utils/format.js';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';
import { UnreadBadge } from '../ui/Badge.jsx';
import { Button, IconButton } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { EmptyState, ErrorState, ListSkeleton } from '../ui/States.jsx';
import { messagePreview } from '../../utils/media.js';

/** Saved contacts plus a server-side people search to add new ones. */
export function ContactsPanel({ query }) {
  const { contacts, contactsStatus, contactsError, presence, conversations } = useChatState();
  const { loadContacts } = useChatActions();
  const [actionError, setActionError] = useState('');

  const rows = useMemo(() => selectContacts(contacts, presence, conversations), [contacts, presence, conversations]);
  const term = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      term
        ? rows.filter(({ contact }) => contact.name.toLowerCase().includes(term) || contact.email?.toLowerCase().includes(term))
        : rows,
    [rows, term],
  );

  return (
    <div className="space-y-4 p-2">
      <ErrorState message={actionError} onDismiss={() => setActionError('')} compact className="mx-1" />

      {term.length >= 2 && <PeopleSearch query={query.trim()} onError={setActionError} />}

      <section>
        <h3 className="px-3 pb-1 text-2xs font-semibold tracking-wider text-ink-faint uppercase">
          Contacts {contactsStatus === 'ready' && `· ${contacts.length}`}
        </h3>
        {contactsStatus === 'loading' || contactsStatus === 'idle' ? (
          <ListSkeleton rows={4} />
        ) : contactsStatus === 'error' ? (
          <ErrorState message={contactsError} onRetry={loadContacts} className="mx-1" />
        ) : filtered.length === 0 ? (
          term ? (
            <p className="px-3 py-4 text-sm text-ink-muted">No saved contacts match “{query.trim()}”.</p>
          ) : (
            <EmptyState icon={Users} title="No contacts yet" description="Search by name, or type someone's full email address above, to find people and add them." />
          )
        ) : (
          <ul className="space-y-0.5">
            {filtered.map(({ contact, conversation }) => (
              <li key={contact.id}>
                <ContactRow contact={contact} conversation={conversation} onError={setActionError} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Memoized: re-renders only when this contact, its conversation or its busy state changes. */
const ContactRow = memo(function ContactRow({ contact, conversation, onError }) {
  const { openConversation, removeContact } = useChatActions();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const conversationId = conversation?.id ?? contact.conversationId;
  const lastMessage = conversation?.lastMessage;
  const unreadCount = conversation?.unreadCount ?? 0;

  const open = useCallback(async () => {
    setBusy('open');
    try {
      const id = conversationId ?? (await openConversation(contact.id)).id;
      navigate(`/c/${id}`);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(null);
    }
  }, [conversationId, contact.id, openConversation, navigate, onError]);

  const remove = useCallback(async () => {
    if (!window.confirm(`Remove ${contact.name} from your contacts? Your conversation history is kept.`)) return;
    setBusy('remove');
    try {
      await removeContact(contact.id);
    } catch (error) {
      onError(error.message);
      setBusy(null);
    }
  }, [contact.id, contact.name, removeContact, onError]);

  return (
    <div className="group flex items-center gap-3 rounded-control px-3 py-2 hover:bg-surface-muted">
      <Avatar user={contact} showStatus />
      <button type="button" onClick={open} className="min-w-0 flex-1 text-left" disabled={Boolean(busy)}>
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn('truncate text-sm text-ink', unreadCount > 0 ? 'font-semibold' : 'font-medium')}>{contact.name}</p>
          {lastMessage && <time className="shrink-0 text-2xs text-ink-faint">{formatListTime(lastMessage.createdAt)}</time>}
        </div>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-muted">
            {contact.isBlocked ? (
              <span className="text-danger">Blocked</span>
            ) : lastMessage ? (
              messagePreview(lastMessage)
            ) : contact.isOnline ? (
              <span className="text-success">Online</span>
            ) : (
              formatLastSeen(contact.lastSeenAt)
            )}
          </p>
          {unreadCount > 0 && <UnreadBadge count={unreadCount} />}
        </div>
      </button>
      {busy ? (
        <Spinner size="sm" className="mx-2" />
      ) : (
        <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <IconButton icon={MessageCircle} label={`Message ${contact.name}`} size="sm" onClick={open} />
          <IconButton icon={UserMinus} label={`Remove ${contact.name}`} size="sm" variant="danger-ghost" onClick={remove} />
        </div>
      )}
    </div>
  );
});

function PeopleSearch({ query, onError }) {
  const debounced = useDebouncedValue(query, 300);
  const [result, setResult] = useState({ status: 'loading', users: [], error: null, query: '' });

  useEffect(() => {
    if (debounced.length < 2) return undefined;
    const controller = new AbortController();
    setResult((r) => ({ ...r, status: 'loading', error: null }));
    usersApi
      .search(debounced, { signal: controller.signal })
      .then(({ users }) => setResult({ status: 'ready', users, error: null, query: debounced }))
      .catch((error) => {
        if (error.name !== 'AbortError') setResult({ status: 'error', users: [], error: error.message, query: debounced });
      });
    return () => controller.abort();
  }, [debounced]);

  const people = useMemo(() => result.users.filter((u) => !u.isContact), [result.users]);

  return (
    <section>
      <h3 className="flex items-center gap-2 px-3 pb-1 text-2xs font-semibold tracking-wider text-ink-faint uppercase">
        Find people {result.status === 'loading' && <Spinner size="sm" className="size-3 border" />}
      </h3>
      {result.status === 'error' ? (
        <ErrorState message={result.error} compact className="mx-1" />
      ) : result.status === 'ready' && people.length === 0 ? (
        <p className="px-3 py-2 text-sm text-ink-muted">No new people found for “{result.query}”.</p>
      ) : (
        <ul className="space-y-0.5">
          {people.map((person) => (
            <li key={person.id}>
              <PersonRow person={person} onError={onError} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PersonRow = memo(function PersonRow({ person, onError }) {
  const { addContact, openConversation, unblockUser } = useChatActions();
  const navigate = useNavigate();
  const [state, setState] = useState(person.isBlocked ? 'blocked' : 'idle');

  const unblock = useCallback(async () => {
    setState('unblocking');
    try {
      await unblockUser(person.id);
      setState('idle');
    } catch (error) {
      onError(error.message);
      setState('blocked');
    }
  }, [person.id, unblockUser, onError]);

  const add = useCallback(async () => {
    setState('adding');
    try {
      await addContact(person.id);
      setState('added');
    } catch (error) {
      onError(error.message);
      setState('idle');
    }
  }, [person.id, addContact, onError]);

  const message = useCallback(async () => {
    try {
      const conversation = await openConversation(person.id);
      navigate(`/c/${conversation.id}`);
    } catch (error) {
      onError(error.message);
    }
  }, [person.id, openConversation, navigate, onError]);

  return (
    <div className="flex items-center gap-3 rounded-control px-3 py-2 hover:bg-surface-muted">
      <Avatar user={person} showStatus />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{person.name}</p>
        {(person.email || person.about) && <p className="truncate text-xs text-ink-muted">{person.email || person.about}</p>}
      </div>
      {state === 'blocked' || state === 'unblocking' ? (
        <Button size="sm" variant="secondary" loading={state === 'unblocking'} onClick={unblock}>
          Unblock
        </Button>
      ) : state === 'added' ? (
        <Button size="sm" variant="secondary" icon={MessageCircle} onClick={message}>
          Message
        </Button>
      ) : (
        <Button size="sm" icon={UserPlus} loading={state === 'adding'} onClick={add}>
          Add
        </Button>
      )}
    </div>
  );
});
