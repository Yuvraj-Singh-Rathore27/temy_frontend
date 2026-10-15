import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Forward, Pencil, Pin, PinOff, Plus, Reply, Star, StarOff, Sticker, Trash2 } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { cn } from '../../utils/misc.js';
import { EmojiPicker, QUICK_REACTIONS } from './EmojiPicker.jsx';

const MARGIN = 8;

/**
 * Context menu for one message, opened by right-click, long-press or the
 * hover button. Positioned at the pointer and kept inside the viewport.
 * `onAction(name, payload?)` receives: reply, react, copy, forward, star, pin, edit, saveSticker, delete.
 */
export function MessageMenu({ message, position, options, onAction, onClose }) {
  const ref = useRef(null);
  const [showPicker, setShowPicker] = useState(false);
  const [coords, setCoords] = useState({ left: position.x, top: position.y, visibility: 'hidden' });
  useClickOutside(ref, onClose);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(Math.max(MARGIN, position.x), window.innerWidth - width - MARGIN);
    // Open upwards when there is no room below.
    const top = position.y + height + MARGIN > window.innerHeight ? Math.max(MARGIN, position.y - height) : position.y;
    setCoords({ left, top, visibility: 'visible' });
  }, [position, showPicker]);

  const run = (name, payload) => {
    onClose();
    onAction(name, message, payload);
  };

  const items = [
    options.canReply && { name: 'reply', label: 'Reply', icon: Reply },
    options.canCopy && { name: 'copy', label: 'Copy', icon: Copy },
    options.canForward && { name: 'forward', label: 'Forward', icon: Forward },
    { name: 'star', label: message.starred ? 'Unstar' : 'Star', icon: message.starred ? StarOff : Star },
    options.canPin && { name: 'pin', label: options.isPinned ? 'Unpin' : 'Pin', icon: options.isPinned ? PinOff : Pin },
    options.canEdit && { name: 'edit', label: 'Edit', icon: Pencil },
    options.canSaveSticker && { name: 'saveSticker', label: 'Save sticker', icon: Sticker },
    { name: 'delete', label: 'Delete', icon: Trash2, danger: true },
  ].filter(Boolean);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Message options"
      style={{ position: 'fixed', ...coords }}
      className="z-50 animate-fade-in"
      onContextMenu={(e) => e.preventDefault()}
    >
      {showPicker ? (
        <EmojiPicker onPick={(emoji) => run('react', emoji)} width={300} height={360} />
      ) : (
        <div className="w-56 overflow-hidden rounded-card border border-line bg-surface shadow-pop">
          {options.canReact && (
            <div className="flex items-center justify-between gap-0.5 border-b border-line px-2 py-1.5">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => run('react', emoji)}
                  aria-label={`React ${emoji}`}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-surface-sunken',
                    options.myReaction === emoji && 'bg-brand-100',
                  )}
                >
                  {emoji}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                aria-label="More reactions"
                className="flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken"
              >
                <Plus className="size-4" />
              </button>
            </div>
          )}
          <div className="p-1">
            {items.map(({ name, label, icon: Icon, danger }) => (
              <button
                key={name}
                type="button"
                role="menuitem"
                onClick={() => run(name)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  danger ? 'text-danger hover:bg-danger-soft' : 'text-ink-soft hover:bg-surface-sunken',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
