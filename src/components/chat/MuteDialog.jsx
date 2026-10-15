import { useState } from 'react';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { cn } from '../../utils/misc.js';
import { Button } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { useToast } from '../ui/Toast.jsx';

const OPTIONS = [
  { value: '8h', label: '8 hours' },
  { value: '1w', label: '1 week' },
  { value: 'always', label: 'Always' },
];

/** Mute notifications for one chat. @mentions still notify. */
export function MuteDialog({ conversationId, peerName, onClose }) {
  const { muteConversation } = useChatActions();
  const toast = useToast();
  const [duration, setDuration] = useState('8h');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await muteConversation(conversationId, duration);
      toast.show(`Muted ${peerName}`);
      onClose();
    } catch (error) {
      toast.error(error.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Mute ${peerName}?`}
      description="You won't be notified about new messages, unless they @mention you. Unread counts still update."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Mute
          </Button>
        </>
      }
    >
      <div className="space-y-1" role="radiogroup" aria-label="Mute for">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 text-sm',
              duration === option.value ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-surface-muted',
            )}
          >
            <input
              type="radio"
              name="mute-duration"
              value={option.value}
              checked={duration === option.value}
              onChange={() => setDuration(option.value)}
              className="size-4 accent-brand-600"
            />
            {option.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}
