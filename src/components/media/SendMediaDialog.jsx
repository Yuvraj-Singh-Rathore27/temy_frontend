import { useEffect, useRef, useState } from 'react';
import { FileText, Music, Play, Plus, Trash2 } from 'lucide-react';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { formatBytes, formatDuration, MAX_FILES_PER_MESSAGE, prepareFiles } from '../../utils/media.js';
import { cn, MAX_MESSAGE_LENGTH } from '../../utils/misc.js';
import { Button } from '../ui/Button.jsx';
import { inputClass } from '../ui/Input.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { ErrorState } from '../ui/States.jsx';

const freePreviews = (items) => {
  for (const item of items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item.posterUrl) URL.revokeObjectURL(item.posterUrl);
  }
};

/**
 * Preview picked files before sending: remove some, add more, write a caption,
 * or send photos/videos as documents (original quality, no compression).
 */
export function SendMediaDialog({ conversationId, files, replyTo, onClose, onSent }) {
  const { sendAttachments } = useChatActions();
  const [items, setItems] = useState([]);
  const [errors, setErrors] = useState([]);
  const [preparing, setPreparing] = useState(true);
  const [caption, setCaption] = useState('');
  const [asFiles, setAsFiles] = useState(false);
  const [sources, setSources] = useState(files);
  const addRef = useRef(null);
  const sentRef = useRef(false);
  const itemsRef = useRef([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // (Re)prepare whenever the source files or the quality choice change.
  useEffect(() => {
    let cancelled = false;
    setPreparing(true);
    prepareFiles(sources.slice(0, MAX_FILES_PER_MESSAGE), { asFiles }).then((result) => {
      if (cancelled) return freePreviews(result.items);
      setItems((previous) => {
        freePreviews(previous);
        return result.items;
      });
      const tooMany = sources.length > MAX_FILES_PER_MESSAGE ? [`Only the first ${MAX_FILES_PER_MESSAGE} files will be sent.`] : [];
      setErrors([...tooMany, ...result.errors]);
      setPreparing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sources, asFiles]);

  // Free local previews unless they were handed over to the outgoing message.
  useEffect(() => () => !sentRef.current && freePreviews(itemsRef.current), []);

  const remove = (item) => setSources((list) => list.filter((file) => file !== item.source));

  const send = () => {
    if (items.length === 0) return;
    sentRef.current = true;
    sendAttachments(conversationId, items, caption.trim(), replyTo);
    onSent?.();
    onClose();
  };

  const hasVisual = sources.some((file) => /^(image|video)\//.test(file.type));

  return (
    <Modal
      title={`Send ${sources.length === 1 ? 'file' : `${Math.min(sources.length, MAX_FILES_PER_MESSAGE)} files`}`}
      onClose={onClose}
      className="sm:max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={preparing || items.length === 0 || caption.length > MAX_MESSAGE_LENGTH}>
            Send
          </Button>
        </>
      }
    >
      {errors.map((error) => (
        <ErrorState key={error} message={error} compact className="mb-2" />
      ))}

      {preparing ? (
        <div className="flex flex-col items-center gap-2 py-10 text-sm text-ink-muted">
          <Spinner />
          Preparing files…
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => (
            <div key={item.localId} className="group relative aspect-square overflow-hidden rounded-lg bg-surface-sunken">
              {item.kind === 'image' ? (
                <img src={item.previewUrl} alt="" className="size-full object-cover" />
              ) : item.kind === 'video' ? (
                <>
                  {item.posterUrl ? <img src={item.posterUrl} alt="" className="size-full object-cover" /> : <div className="size-full bg-ink-soft" />}
                  <span className="absolute inset-0 m-auto flex size-9 items-center justify-center rounded-full bg-black/50 text-white">
                    <Play className="ml-0.5 size-4 fill-current" />
                  </span>
                  {item.durationMs != null && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-2xs text-white">{formatDuration(item.durationMs)}</span>
                  )}
                </>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                  {item.kind === 'audio' ? <Music className="size-7 text-amber-500" /> : <FileText className="size-7 text-sky-500" />}
                  <p className="line-clamp-2 text-2xs font-medium break-all text-ink">{item.name}</p>
                  <p className="text-2xs text-ink-muted">{formatBytes(item.size)}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`Remove ${item.name}`}
                className="absolute top-1 right-1 rounded-full bg-black/55 p-1.5 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {sources.length < MAX_FILES_PER_MESSAGE && (
            <button
              type="button"
              onClick={() => addRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong text-xs text-ink-muted hover:border-brand-400 hover:text-brand-600"
            >
              <Plus className="size-6" /> Add
            </button>
          )}
        </div>
      )}

      <input
        ref={addRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const more = [...(e.target.files ?? [])];
          e.target.value = '';
          setSources((list) => [...list, ...more]);
        }}
      />

      {hasVisual && (
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={asFiles} onChange={(e) => setAsFiles(e.target.checked)} className="size-4 accent-brand-600" />
          Send photos and videos as files (original quality)
        </label>
      )}

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={2}
        placeholder="Add a caption…"
        aria-label="Caption"
        className={cn(inputClass, 'mt-3 resize-none py-2')}
      />
    </Modal>
  );
}
