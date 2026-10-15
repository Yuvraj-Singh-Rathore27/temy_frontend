import { memo, useState } from 'react';
import { Pin, X } from 'lucide-react';
import { IconButton } from '../ui/Button.jsx';
import { messagePreview } from '../../utils/media.js';

/**
 * Pinned messages under the chat header. Clicking jumps to the shown pin and
 * advances to the next one (like WhatsApp); the x unpins it.
 */
export const PinnedBar = memo(function PinnedBar({ pins, me, peerName, onJump, onUnpin }) {
  const [index, setIndex] = useState(0);
  if (!pins?.length) return null;
  const current = pins[index % pins.length];

  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface px-gutter py-1.5">
      <Pin className="size-4 shrink-0 text-brand-600" aria-hidden />
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => {
          onJump(current.messageId);
          setIndex((i) => (i + 1) % pins.length);
        }}
        aria-label="Go to pinned message"
      >
        <p className="text-2xs font-semibold text-brand-700">
          Pinned{pins.length > 1 && ` · ${(index % pins.length) + 1} of ${pins.length}`} · {current.senderId === me ? 'You' : (current.senderName ?? peerName)}
        </p>
        <p className="truncate text-sm text-ink-soft">{messagePreview(current) || 'This message was deleted'}</p>
      </button>
      <IconButton icon={X} label="Unpin" size="sm" onClick={() => onUnpin(current.messageId)} />
    </div>
  );
});
