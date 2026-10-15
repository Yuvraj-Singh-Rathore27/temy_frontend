import { useRef, useState } from 'react';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { useChatActions, useChatState } from '../../chat/ChatContext.jsx';
import { WALLPAPER_PRESETS, wallpaperStyle } from '../../utils/appearance.js';
import { compressImage } from '../../utils/media.js';
import { cn } from '../../utils/misc.js';
import { Button } from '../ui/Button.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { useToast } from '../ui/Toast.jsx';

/**
 * Choose a wallpaper. `value` is the current choice; `onChoose(value)` saves it.
 * With `allowDefault`, the first tile means "use my default wallpaper" (value null).
 */
export function WallpaperPicker({ title, value, onChoose, onClose, allowDefault = false }) {
  const { wallpapers } = useChatState();
  const { uploadWallpaper, deleteWallpaper } = useChatActions();
  const toast = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(null); // 'upload' | value being saved

  const choose = async (next) => {
    setBusy(next ?? 'default');
    try {
      await onChoose(next);
      onClose();
    } catch (error) {
      toast.error(error.message);
      setBusy(null);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error('Choose a JPG, PNG or WebP image.');
    setBusy('upload');
    try {
      const { blob } = await compressImage(file); // resized to max 2048 px, EXIF stripped
      const wallpaper = await uploadWallpaper(blob);
      await choose(wallpaper.value);
    } catch (error) {
      toast.error(error.message);
      setBusy(null);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
    return undefined;
  };

  const remove = async (wallpaper) => {
    if (!window.confirm('Delete this wallpaper? Chats using it go back to your default.')) return;
    try {
      await deleteWallpaper(wallpaper.id);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const tiles = [
    ...(allowDefault ? [{ value: null, label: 'Default' }] : []),
    ...wallpapers.map((w) => ({ value: w.value, label: 'Your photo', custom: w })),
    ...WALLPAPER_PRESETS,
  ];

  return (
    <Modal title={title} onClose={onClose} className="sm:max-w-lg">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={Boolean(busy)}
          className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed border-line-strong text-xs text-ink-muted hover:border-brand-400 hover:text-brand-600"
        >
          {busy === 'upload' ? <Spinner size="sm" /> : <ImagePlus className="size-6" />}
          Upload
        </button>
        {tiles.map((tile) => {
          const selected = (tile.value ?? null) === (value ?? null);
          const look = tile.value === null ? { className: 'wallpaper wallpaper-dots' } : wallpaperStyle(tile.value, wallpapers);
          return (
            <div key={tile.value ?? 'default'} className="group relative">
              <button
                type="button"
                onClick={() => choose(tile.value)}
                disabled={Boolean(busy)}
                aria-pressed={selected}
                aria-label={tile.label}
                className={cn(
                  'relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-control border-2 p-1.5 text-left',
                  look.className,
                  selected ? 'border-brand-500' : 'border-line',
                )}
                style={look.style}
              >
                {/* Mini bubbles so the preview looks like a chat. */}
                <span className="mb-1 h-2.5 w-3/5 rounded-full bg-bubble-in shadow-bubble" />
                <span className="mb-1.5 ml-auto h-2.5 w-1/2 rounded-full bg-bubble-out" />
                <span className="rounded bg-surface/85 px-1 text-2xs font-medium text-ink">{tile.label}</span>
                {selected && (
                  <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-brand-600 text-white">
                    <Check className="size-3" />
                  </span>
                )}
                {busy === (tile.value ?? 'default') && (
                  <span className="absolute inset-0 flex items-center justify-center bg-surface/60">
                    <Spinner size="sm" />
                  </span>
                )}
              </button>
              {tile.custom && (
                <button
                  type="button"
                  onClick={() => remove(tile.custom)}
                  aria-label="Delete wallpaper"
                  className="absolute top-1.5 left-1.5 rounded-full bg-black/55 p-1 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
