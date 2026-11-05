import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, Search } from 'lucide-react';
import { messagesApi } from '../../api/endpoints.js';
import { selectConversationList } from '../../chat/chatReducer.js';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { formatDayLabel, formatTime } from '../../utils/format.js';
import { canDeleteForEveryone } from '../../utils/messages.js';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { inputClass } from '../ui/Input.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { MessageStatus } from './MessageStatus.jsx';
import { useToast } from '../ui/Toast.jsx';
import { messagePreview } from '../../utils/media.js';
import { canSend, chatAvatar, chatTitle } from '../../utils/conversation.js';

const DETAILS_REFRESH_MS = 5000;

/** "Today, 14:05"; receipts from before times were saved have none. */
const receiptTime = (value) => (value ? `${formatDayLabel(value)}, ${formatTime(value)}` : 'Time not recorded');

function ReceiptHeading({ status, children }) {
  return (
    <h3 className="flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-brand-600">
      {children}
      <MessageStatus status={status} tone="onSurface" className="size-4" />
    </h3>
  );
}

/** A group's "Read by" or "Delivered to" card: photo, name and time per person, and how many are still to come. */
function ReceiptGroup({ title, status, members, timeOf, remaining }) {
  return (
    <section className="rounded-card bg-surface shadow-bubble">
      <ReceiptHeading status={status}>{title}</ReceiptHeading>
      {members.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar user={member} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{member.name}</p>
                <p className="text-xs text-ink-muted">{receiptTime(timeOf(member))}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && <p className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">{remaining} remaining</p>}
    </section>
  );
}

/** A one-to-one chat: just when it was read and delivered. */
function ReceiptRow({ title, status, time }) {
  return (
    <section className="rounded-card bg-surface shadow-bubble">
      <ReceiptHeading status={status}>{title}</ReceiptHeading>
      <p className="border-t border-line px-4 py-2.5 text-xs text-ink-muted">{time ? receiptTime(time) : 'Not yet'}</p>
    </section>
  );
}

/**
 * "Message info": the message, then who it reached and who read it, with photos and times.
 * A full page on phones and a side panel on larger screens. Stays up to date while open.
 */
export function MessageDetailsDialog({ message, isGroup, onClose }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    const load = () =>
      messagesApi
        .details(message.id)
        .then((details) => alive && setState({ status: 'ready', details }))
        .catch((error) => alive && setState((current) => (current.details ? current : { status: 'error', error: error.message })));
    load();
    const timer = setInterval(load, DETAILS_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [message.id]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const details = state.details;
  const read = details?.members.filter((m) => m.status === 'read') ?? [];
  const delivered = details?.members.filter((m) => m.status === 'delivered') ?? [];
  const peer = details?.members[0];
  const overall = details ? (details.total > 0 && details.readCount === details.total ? 'read' : details.total > 0 && details.deliveredCount === details.total ? 'delivered' : 'sent') : (message.status ?? 'sent');

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-info-title"
        className="flex h-full w-full flex-col bg-surface-sunken shadow-pop md:max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-3">
          <button type="button" onClick={onClose} autoFocus aria-label="Back" className="rounded-full p-2 text-ink-soft hover:bg-surface-sunken">
            <ArrowLeft className="size-5" />
          </button>
          <h2 id="message-info-title" className="text-lg font-semibold text-ink">
            Message info
          </h2>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="flex justify-end py-2">
            <div className="max-w-[85%] rounded-bubble bg-bubble-out px-3.5 pt-2 pb-1.5 text-bubble-out-ink shadow-bubble">
              <p className="text-sm break-words whitespace-pre-wrap">{message.body || messagePreview(message)}</p>
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] opacity-80">
                {formatTime(message.createdAt)}
                <MessageStatus status={overall} />
              </p>
            </div>
          </div>
          {state.status === 'loading' && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {state.status === 'error' && <p className="text-sm text-danger">{state.error}</p>}
          {details && isGroup && (
            <>
              <ReceiptGroup title="Read by" status="read" members={read} timeOf={(m) => m.readAt} remaining={details.total - details.readCount} />
              <ReceiptGroup title="Delivered to" status="delivered" members={delivered} timeOf={(m) => m.deliveredAt} remaining={details.total - details.deliveredCount} />
            </>
          )}
          {details && !isGroup && (
            <>
              <ReceiptRow title="Read" status="read" time={peer?.readAt} />
              <ReceiptRow title="Delivered" status="delivered" time={peer?.deliveredAt} />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** "Delete for me" / "Delete for everyone" (the latter only when allowed). */
export function DeleteMessageDialog({ message, onClose }) {
  const { me, deleteMessage } = useChatActions();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const forEveryone = canDeleteForEveryone(message, me);

  const remove = async (scope) => {
    setBusy(scope);
    try {
      await deleteMessage(message, scope);
      onClose();
    } catch (error) {
      toast.error(error.message);
      setBusy(null);
    }
  };

  return (
    <Modal
      title="Delete message?"
      description={forEveryone ? 'Delete for everyone removes it for both of you.' : 'It will be removed from this device and your other sessions.'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={forEveryone ? 'secondary' : 'danger'} loading={busy === 'me'} disabled={Boolean(busy)} onClick={() => remove('me')}>
            Delete for me
          </Button>
          {forEveryone && (
            <Button variant="danger" loading={busy === 'everyone'} disabled={Boolean(busy)} onClick={() => remove('everyone')}>
              Delete for everyone
            </Button>
          )}
        </>
      }
    >
      <p className="line-clamp-3 rounded-control bg-surface-muted px-3 py-2 text-sm break-words text-ink-soft">
        {messagePreview(message) || 'This message was deleted'}
      </p>
    </Modal>
  );
}

const MAX_TARGETS = 5;

/** Pick up to 5 chats to forward a message to. */
export function ForwardDialog({ message, onClose }) {
  const { conversations, presence } = useChatState();
  const { forwardMessage } = useChatActions();
  const toast = useToast();
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);

  const all = useMemo(() => selectConversationList(conversations, presence), [conversations, presence]);
  const term = query.trim().toLowerCase();
  const options = useMemo(
    () => all.filter((c) => canSend(c) && (!term || chatTitle(c).toLowerCase().includes(term))),
    [all, term],
  );

  const toggle = (id) =>
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < MAX_TARGETS ? [...list, id] : list));

  const send = async () => {
    setSending(true);
    try {
      await forwardMessage(message, selected);
      toast.show(selected.length === 1 ? 'Message forwarded' : `Forwarded to ${selected.length} chats`);
      onClose();
    } catch (error) {
      toast.error(error.message);
      setSending(false);
    }
  };

  return (
    <Modal
      title="Forward message"
      description={`Choose up to ${MAX_TARGETS} chats.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} loading={sending} disabled={selected.length === 0}>
            Forward{selected.length > 0 && ` (${selected.length})`}
          </Button>
        </>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className={cn(inputClass, 'h-10 pl-9')}
        />
      </div>
      {options.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No chats found.</p>
      ) : (
        <ul className="space-y-0.5">
          {options.map((conversation) => {
            const checked = selected.includes(conversation.id);
            const disabled = !checked && selected.length >= MAX_TARGETS;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={disabled}
                  onClick={() => toggle(conversation.id)}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-surface-muted disabled:opacity-50"
                >
                  <Avatar user={chatAvatar(conversation)} size="sm" />
                  <span className="flex-1 truncate text-sm font-medium text-ink">{chatTitle(conversation)}</span>
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full border',
                      checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong',
                    )}
                  >
                    {checked && <Check className="size-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
