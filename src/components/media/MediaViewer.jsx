import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { downloadAttachment } from '../../api/files.js';
import { formatTime } from '../../utils/format.js';
import { cn } from '../../utils/misc.js';
import { useToast } from '../ui/Toast.jsx';
import { SecureImage, SecureVideo } from './SecureMedia.jsx';

/**
 * Full-screen photo/video viewer. `items`: attachments with optional
 * { senderName, createdAt, caption }. Arrow keys / swipe buttons move between items.
 */
export function MediaViewer({ items, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex((i) => Math.min(items.length - 1, i + 1)), [items.length]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowLeft') prev();
      else if (event.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next]);

  if (!item) return null;

  const download = async () => {
    setDownloading(true);
    try {
      await downloadAttachment(item);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label="Media viewer">
      <header className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          {item.senderName && <p className="truncate text-sm font-medium">{item.senderName}</p>}
          <p className="text-xs text-white/60">
            {item.createdAt && formatTime(item.createdAt)}
            {items.length > 1 && ` · ${index + 1} of ${items.length}`}
          </p>
        </div>
        <button type="button" onClick={download} disabled={downloading} aria-label="Download" className="rounded-full p-2.5 hover:bg-white/10 disabled:opacity-50">
          <Download className="size-5" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2.5 hover:bg-white/10">
          <X className="size-5" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-2" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {item.kind === 'video' ? (
          <SecureVideo key={item.id} url={item.url} posterUrl={item.thumbnailUrl} controls autoPlay playsInline className="max-h-full max-w-full rounded" />
        ) : (
          <SecureImage key={item.id} url={item.url} alt={item.name} className="max-h-full max-w-full rounded object-contain" />
        )}
        {hasPrev && <NavButton side="left" onClick={prev} />}
        {hasNext && <NavButton side="right" onClick={next} />}
      </div>

      {item.caption && <p className="safe-bottom px-gutter pt-2 text-center text-sm break-words text-white/90">{item.caption}</p>}
    </div>,
    document.body,
  );
}

function NavButton({ side, onClick }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className={cn('absolute top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 hover:bg-white/20', side === 'left' ? 'left-3' : 'right-3')}
    >
      <Icon className="size-6" />
    </button>
  );
}
