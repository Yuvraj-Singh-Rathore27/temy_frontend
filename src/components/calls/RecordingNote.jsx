import { useEffect, useState } from 'react';
import { Download, Mic, Trash2, Video } from 'lucide-react';
import { assetUrl } from '../../api/client.js';
import { recordingsApi } from '../../api/endpoints.js';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { eventText } from '../../utils/conversation.js';
import { formatTime } from '../../utils/format.js';
import { cn } from '../../utils/misc.js';
import { useSecureSrc } from '../media/SecureMedia.jsx';
import { useToast } from '../ui/Toast.jsx';

/**
 * "You recorded the video call · 2:31" with a player, in the chat of both people.
 * The recorder can delete it (for both). Recordings are kept on the server (S3),
 * not end-to-end encrypted like messages.
 */
export function RecordingNote({ message, me, highlighted }) {
  const data = message.event.data;
  const mine = data.recorderId === me;
  const { subscribe } = useChatActions();
  const toast = useToast();
  const [deleted, setDeleted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { src, onError, failed } = useSecureSrc(deleted ? null : data.url);

  useEffect(
    () => subscribe('recording:deleted', ({ recordingId }) => recordingId === data.recordingId && setDeleted(true)),
    [subscribe, data.recordingId],
  );

  const remove = async () => {
    try {
      await recordingsApi.remove(data.recordingId);
      setDeleted(true);
    } catch (error) {
      toast.error(error.message || 'Could not delete the recording');
    } finally {
      setConfirming(false);
    }
  };

  const Icon = data.kind === 'video' ? Video : Mic;
  const unavailable = deleted || failed;

  return (
    <div data-message-id={message.id ?? undefined} className={cn('my-2 flex justify-center', highlighted && 'animate-highlight')}>
      <div className="w-full max-w-sm rounded-2xl bg-surface/95 p-3 text-xs text-ink-muted shadow-bubble backdrop-blur">
        <p className="flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0 text-red-600" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{eventText(message, me)}</span>
          <span className="shrink-0 tabular-nums">{formatTime(message.createdAt)}</span>
        </p>

        {unavailable ? (
          <p className="mt-2 rounded-lg bg-surface-sunken px-3 py-2 text-center">{deleted ? 'This recording was deleted' : 'Recording unavailable'}</p>
        ) : data.kind === 'video' ? (
          <video controls preload="metadata" playsInline src={src ?? undefined} onError={onError} className="mt-2 max-h-64 w-full rounded-lg bg-black" />
        ) : (
          <audio controls preload="metadata" src={src ?? undefined} onError={onError} className="mt-2 w-full" />
        )}

        {!unavailable && (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            <span className="mr-auto text-[11px] text-ink-faint">Saved on the server · not end-to-end encrypted</span>
            <a href={assetUrl(`${data.url}?download=1`)} className="flex items-center gap-1 font-medium text-brand-700 hover:underline">
              <Download className="size-3.5" aria-hidden /> Download
            </a>
            {mine &&
              (confirming ? (
                <span className="flex items-center gap-2">
                  Delete for both?
                  <button type="button" onClick={remove} className="font-semibold text-danger hover:underline">
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="hover:underline">
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="flex items-center gap-1 hover:text-danger">
                  <Trash2 className="size-3.5" aria-hidden /> Delete
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
