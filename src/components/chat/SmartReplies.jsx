import { useEffect, useMemo, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { smartRepliesEnabled } from '../../ai/aiClient.js';
import { realMessages } from '../../ai/chatText.js';
import { quickReplies } from '../../ai/quickReplies.js';
import { useThread } from '../../chat/ChatContext.jsx';

function useSmartRepliesSetting() {
  const [enabled, setEnabled] = useState(smartRepliesEnabled);
  useEffect(() => {
    const update = () => setEnabled(smartRepliesEnabled());
    window.addEventListener('temu:smart-replies', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('temu:smart-replies', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return enabled;
}

/**
 * Tap-to-send reply suggestions for the last message someone sent me, from simple rules
 * (English and Hinglish): instant, private and nothing to download. (The small on-device
 * model wrote odd replies too often to be used here.)
 */
export function SmartReplies({ conversationId, me, hidden, onSend, onEdit }) {
  const enabled = useSmartRepliesSetting();
  const thread = useThread(conversationId);
  const last = useMemo(() => realMessages(thread.items).at(-1), [thread.items]);
  const incoming = last && last.senderId !== me ? last : null;
  const [dismissed, setDismissed] = useState(null);

  const quick = useMemo(() => (incoming ? quickReplies(incoming) : []), [incoming]);

  if (!enabled || hidden || !incoming || dismissed === incoming.id || !quick.length) return null;

  return (
    <div className="mb-2 flex items-center gap-1.5" role="group" aria-label="Suggested replies">
      <div className="scrollbar-none flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {quick.map((reply) => (
          <span key={reply} className="inline-flex shrink-0 items-center rounded-pill border border-brand-200 bg-brand-50 text-sm text-brand-700">
            <button
              type="button"
              onClick={() => onSend(reply)}
              className="rounded-l-pill py-1 pr-1.5 pl-3 hover:bg-brand-100"
              aria-label={`Send "${reply}"`}
            >
              {reply}
            </button>
            <button
              type="button"
              onClick={() => onEdit(reply)}
              className="rounded-r-pill py-1 pr-2.5 pl-1 text-brand-500 hover:bg-brand-100 hover:text-brand-700"
              aria-label={`Edit "${reply}" before sending`}
              title="Edit before sending"
            >
              <Pencil className="size-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <button type="button" onClick={() => setDismissed(incoming.id)} aria-label="Hide suggestions" className="shrink-0 rounded-full p-1 text-ink-faint hover:text-ink-muted">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
