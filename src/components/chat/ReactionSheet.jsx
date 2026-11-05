import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SmilePlus } from 'lucide-react';
import { messagesApi } from '../../api/endpoints.js';
import { cn } from '../../utils/misc.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { EmojiPicker } from './EmojiPicker.jsx';

/**
 * Tapping a reaction on a message: who reacted with what. Tap your own row to remove your
 * reaction, or add a new one. Closes by itself once the message has no reactions left.
 */
export function ReactionSheet({ message, me, canReact, onReact, onClose }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(null);
  const [picking, setPicking] = useState(false);

  // Fetched again whenever the reactions change, including live changes from other people.
  const signature = (message.reactions ?? []).map((r) => `${r.userId}:${r.emoji}`).join(',');
  useEffect(() => {
    let alive = true;
    messagesApi
      .reactions(message.id)
      .then(({ reactions }) => {
        if (!alive) return;
        setPeople(reactions);
        setError('');
      })
      .catch((failure) => alive && setError(failure.message));
    return () => {
      alive = false;
    };
  }, [message.id, signature]);

  useEffect(() => {
    if (!signature) onClose();
  }, [signature, onClose]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = useMemo(() => people ?? [], [people]);
  const counts = useMemo(() => {
    const map = new Map();
    for (const { emoji } of list) map.set(emoji, (map.get(emoji) ?? 0) + 1);
    return [...map.entries()];
  }, [list]);
  const activeFilter = counts.some(([emoji]) => emoji === filter) ? filter : null;
  const shown = activeFilter ? list.filter((r) => r.emoji === activeFilter) : list;
  const chipClass = (active) =>
    cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors', active ? 'bg-brand-100 text-brand-800' : 'bg-surface-muted text-ink-soft hover:bg-surface-sunken');

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reaction-sheet-title"
        className="flex max-h-[75dvh] w-full flex-col rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-pop md:max-w-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
        <h2 id="reaction-sheet-title" className="px-4 pt-3 pb-3 text-base font-semibold text-ink">
          {list.length} {list.length === 1 ? 'reaction' : 'reactions'}
        </h2>

        <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3">
          {canReact && (
            <button type="button" onClick={() => setPicking((open) => !open)} aria-label="Add a reaction" aria-expanded={picking} className={chipClass(picking)}>
              <SmilePlus className="size-5" aria-hidden />
            </button>
          )}
          {counts.length > 1 && (
            <button type="button" onClick={() => setFilter(null)} aria-pressed={!activeFilter} className={chipClass(!activeFilter)}>
              All {list.length}
            </button>
          )}
          {counts.map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setFilter(emoji)}
              aria-pressed={activeFilter === emoji || counts.length === 1}
              aria-label={`${emoji} ${count}`}
              className={chipClass(activeFilter === emoji || counts.length === 1)}
            >
              <span className="text-base leading-none">{emoji}</span>
              {count}
            </button>
          ))}
        </div>

        {picking && (
          <div className="flex shrink-0 justify-center pb-3">
            <EmojiPicker
              width={Math.min(320, window.innerWidth - 32)}
              height={300}
              onPick={(emoji) => {
                setPicking(false);
                const current = list.find((r) => r.userId === me)?.emoji;
                if (emoji !== current) onReact(message, emoji);
              }}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          {!people && !error && (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          )}
          {error && <p className="px-4 py-3 text-sm text-danger">{error}</p>}
          <ul>
            {shown.map((reaction) => {
              const mine = reaction.userId === me;
              const body = (
                <>
                  <Avatar user={{ id: reaction.userId, name: reaction.name, avatarUrl: reaction.avatarUrl }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{mine ? 'You' : reaction.name}</span>
                    {mine && <span className="block text-xs text-ink-muted">Tap to remove</span>}
                  </span>
                  <span className="text-2xl leading-none">{reaction.emoji}</span>
                </>
              );
              return (
                <li key={reaction.userId}>
                  {mine ? (
                    <button type="button" onClick={() => onReact(message, reaction.emoji)} aria-label={`Remove your ${reaction.emoji} reaction`} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-muted">
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
