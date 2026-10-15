import { lazy, Suspense } from 'react';
import { Spinner } from '../ui/Spinner.jsx';

// Loaded on first open only: the emoji data is large and most visits never need it.
const Picker = lazy(() => import('emoji-picker-react'));

/** Full emoji picker using the device's own emoji font (no images or network requests). */
export function EmojiPicker({ onPick, width = 320, height = 380 }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center rounded-card bg-surface shadow-pop" style={{ width, height }}>
          <Spinner />
        </div>
      }
    >
      <Picker
        onEmojiClick={(data) => onPick(data.emoji)}
        emojiStyle="native"
        lazyLoadEmojis
        skinTonesDisabled={false}
        previewConfig={{ showPreview: false }}
        width={width}
        height={height}
        searchPlaceholder="Search emoji"
      />
    </Suspense>
  );
}

/** Quick reactions offered in the message menu. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
