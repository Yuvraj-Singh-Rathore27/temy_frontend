import { memo } from 'react';
import { Play, X } from 'lucide-react';
import { formatDuration } from '../../utils/media.js';
import { cn } from '../../utils/misc.js';
import { AudioPlayer } from './AudioPlayer.jsx';
import { FileCard } from './FileCard.jsx';
import { ProgressRing } from './ProgressRing.jsx';
import { SecureImage } from './SecureMedia.jsx';

const isVisual = (a) => a.kind === 'image' || a.kind === 'video';

/**
 * Attachments inside a bubble: a photo/video grid (opens the viewer), audio and
 * voice players, and file cards. While uploading, each item shows its progress.
 */
export const MessageAttachments = memo(function MessageAttachments({ message, mine, onOpenMedia, onCancelUpload }) {
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return null;
  const visual = attachments.filter(isVisual);
  const others = attachments.filter((a) => !isVisual(a));
  const tone = mine ? 'out' : 'in';
  const uploading = Boolean(message.uploading) && message.status !== 'failed';

  return (
    <div className="space-y-1.5">
      {visual.length > 0 && (
        <MediaGrid items={visual} uploading={uploading} onOpen={(index) => onOpenMedia?.(message, visual[index])} />
      )}
      {others.map((attachment) => (
        <div key={attachment.id ?? attachment.localId} className="relative">
          {attachment.kind === 'voice' || attachment.kind === 'audio' ? (
            <AudioPlayer attachment={attachment} tone={tone} />
          ) : (
            <FileCard attachment={attachment} tone={tone} uploading={uploading} />
          )}
          {uploading && attachment.progress < 1 && (
            <p className={cn('mt-0.5 text-2xs', mine ? 'text-white/75' : 'text-ink-muted')}>Uploading… {Math.round((attachment.progress ?? 0) * 100)}%</p>
          )}
        </div>
      ))}
      {uploading && (
        <button
          type="button"
          onClick={() => onCancelUpload?.(message)}
          className={cn('flex items-center gap-1 text-2xs font-medium', mine ? 'text-white/85 hover:text-white' : 'text-ink-muted hover:text-danger')}
        >
          <X className="size-3" /> Cancel upload
        </button>
      )}
    </div>
  );
});

/** 1 item: natural aspect ratio. 2+: square tiles, at most 4 with "+N". */
function MediaGrid({ items, uploading, onOpen }) {
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  const single = items.length === 1;

  return (
    <div className={cn('grid gap-1 overflow-hidden rounded-xl', single ? 'grid-cols-1' : 'grid-cols-2')} style={{ width: single ? undefined : 'min(18rem, 70vw)' }}>
      {shown.map((item, index) => (
        <button
          key={item.id ?? item.localId}
          type="button"
          onClick={() => !uploading && onOpen(index)}
          aria-label={item.kind === 'video' ? 'Play video' : 'Open photo'}
          className={cn(
            'relative block overflow-hidden bg-black/10',
            single ? 'max-h-80 w-[min(18rem,70vw)]' : 'aspect-square',
            items.length === 3 && index === 0 && 'col-span-2 aspect-[2/1]',
          )}
          style={single && item.width && item.height ? { aspectRatio: `${item.width} / ${Math.max(item.height, item.width * 0.4)}` } : undefined}
        >
          <SecureImage
            url={item.kind === 'video' ? (item.thumbnailUrl ?? item.posterUrl) : (item.previewUrl ?? item.url)}
            className="size-full object-cover"
            loading="lazy"
          />
          {item.mimeType === 'image/gif' && (
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 text-2xs font-bold text-white">GIF</span>
          )}
          {item.kind === 'video' && (
            <>
              <span className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-black/50 text-white">
                <Play className="ml-0.5 size-6 fill-current" />
              </span>
              {item.durationMs != null && (
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 text-2xs text-white">{formatDuration(item.durationMs)}</span>
              )}
            </>
          )}
          {uploading && item.progress < 1 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/35">
              <ProgressRing progress={item.progress ?? 0} tone="dark" />
            </span>
          )}
          {index === shown.length - 1 && extra > 0 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white">+{extra}</span>
          )}
        </button>
      ))}
    </div>
  );
}
