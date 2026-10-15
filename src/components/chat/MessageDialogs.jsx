import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { selectConversationList } from '../../chat/chatReducer.js';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { canDeleteForEveryone } from '../../utils/messages.js';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from '../ui/Button.jsx';
import { inputClass } from '../ui/Input.jsx';
import { Modal } from '../ui/Modal.jsx';
import { useToast } from '../ui/Toast.jsx';
import { messagePreview } from '../../utils/media.js';
import { canSend, chatAvatar, chatTitle } from '../../utils/conversation.js';

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
