import { memo, useRef, useState } from 'react';
import { Download, Eye, File, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, X } from 'lucide-react';
import { downloadAttachment } from '../../api/files.js';
import { formatBytes } from '../../utils/media.js';
import { cn } from '../../utils/misc.js';
import { useToast } from '../ui/Toast.jsx';
import { DocumentViewer, isViewableDocument } from './DocumentViewer.jsx';
import { ProgressRing } from './ProgressRing.jsx';
import { SecureImage } from './SecureMedia.jsx';

function iconFor(mimeType = '', name = '') {
  if (mimeType === 'application/pdf' || /\.(docx?|odt|txt|md|rtf)$/i.test(name)) return FileText;
  if (/sheet|excel|csv/.test(mimeType) || /\.(xlsx?|ods|csv)$/i.test(name)) return FileSpreadsheet;
  if (/zip|rar|7z|gzip/.test(mimeType)) return FileArchive;
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  return File;
}

const extensionLabel = (name = '') => (name.includes('.') ? name.split('.').pop().toUpperCase().slice(0, 5) : 'FILE');

/**
 * Document card: icon, name, size and download (with progress + cancel). PDFs
 * show their first page and page count; PDFs and text files open in the viewer.
 */
export const FileCard = memo(function FileCard({ attachment, tone = 'in', uploading }) {
  const toast = useToast();
  const [progress, setProgress] = useState(null);
  const controllerRef = useRef(null);
  const Icon = iconFor(attachment.mimeType, attachment.name);
  const onBrand = tone === 'out';
  const saved = Boolean(attachment.url);
  const [viewing, setViewing] = useState(false);
  const viewable = saved && !uploading && isViewableDocument(attachment);
  const previewUrl = attachment.posterUrl ?? attachment.thumbnailUrl; // local while uploading, then the server's

  const download = async () => {
    controllerRef.current = new AbortController();
    setProgress(0);
    try {
      await downloadAttachment(attachment, { onProgress: setProgress, signal: controllerRef.current.signal });
    } catch (error) {
      if (error.name !== 'AbortError') toast.error(error.message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className={cn('w-72 max-w-full overflow-hidden rounded-control', onBrand ? 'bg-white/15' : 'bg-surface-muted')}>
      {previewUrl && (
        <button
          type="button"
          onClick={() => viewable && setViewing(true)}
          disabled={!viewable}
          aria-label={`Open ${attachment.name}`}
          className="block max-h-40 w-full overflow-hidden bg-white"
        >
          <SecureImage url={previewUrl} className="w-full object-cover object-top" loading="lazy" />
        </button>
      )}
      <div className="flex items-center gap-3 p-2.5">
        <div className={cn('relative flex size-11 shrink-0 items-center justify-center rounded-lg', onBrand ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-600')}>
          <Icon className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', onBrand ? 'text-white' : 'text-ink')} title={attachment.name}>
            {attachment.name}
          </p>
          <p className={cn('text-2xs', onBrand ? 'text-white/75' : 'text-ink-muted')}>
            {attachment.pageCount ? `${attachment.pageCount} ${attachment.pageCount === 1 ? 'page' : 'pages'} · ` : ''}
            {extensionLabel(attachment.name)} · {formatBytes(attachment.size)}
            {progress != null && ` · ${Math.round(progress * 100)}%`}
          </p>
        </div>
        {saved && !uploading && (
          <div className="flex shrink-0 items-center">
            {viewable && (
              <button
                type="button"
                onClick={() => setViewing(true)}
                aria-label={`Open ${attachment.name}`}
                className={cn('rounded-full p-2', onBrand ? 'text-white hover:bg-white/15' : 'text-ink-muted hover:bg-surface-sunken')}
              >
                <Eye className="size-4" />
              </button>
            )}
            {progress == null ? (
              <button
                type="button"
                onClick={download}
                aria-label={`Download ${attachment.name}`}
                className={cn('rounded-full p-2', onBrand ? 'text-white hover:bg-white/15' : 'text-ink-muted hover:bg-surface-sunken')}
              >
                <Download className="size-4" />
              </button>
            ) : (
              <button type="button" onClick={() => controllerRef.current?.abort()} aria-label="Cancel download" className="relative p-1">
                <ProgressRing progress={progress} size={28} tone={tone} />
                <X className={cn('absolute inset-0 m-auto size-3', onBrand ? 'text-white' : 'text-ink')} />
              </button>
            )}
          </div>
        )}
      </div>
      {viewing && <DocumentViewer attachment={attachment} onClose={() => setViewing(false)} />}
    </div>
  );
});
