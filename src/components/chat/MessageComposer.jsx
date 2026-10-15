import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Mic, Pencil, Reply, SendHorizontal, Smile, X } from 'lucide-react';
import { gifsApi, stickersApi } from '../../api/endpoints.js';
import { useChatActions } from '../../chat/ChatContext.jsx';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import { useTypingEmitter } from '../../hooks/useTypingEmitter.js';
import { cn, MAX_MESSAGE_LENGTH } from '../../utils/misc.js';
import { AttachmentMenu } from '../media/AttachmentMenu.jsx';
import { canRecordVoice, VoiceRecorder } from '../media/VoiceRecorder.jsx';
import { IconButton } from '../ui/Button.jsx';
import { useToast } from '../ui/Toast.jsx';
import { ExpressionPicker } from './ExpressionPicker.jsx';
import { SmartReplies } from './SmartReplies.jsx';
import { messagePreview } from '../../utils/media.js';

const MAX_HEIGHT_PX = 160;
const drafts = new Map(); // conversationId -> unsent text (kept while switching chats)

/**
 * Message input. `mode` is null, { type: 'reply', message } or { type: 'edit', message };
 * `onCancelMode` leaves reply/edit mode. `onPickFiles(files)` opens the send-files dialog.
 * Memoized: chat events elsewhere never re-render the input while the user types.
 */
export const MessageComposer = memo(function MessageComposer({ conversationId, mode, onCancelMode, onPickFiles, onShareLocation, peerName, me }) {
  const { sendMessage, sendAttachments, sendSticker, sendPrepared, editMessage, setTyping } = useChatActions();
  const toast = useToast();
  const [text, setText] = useState(() => drafts.get(conversationId) ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const textareaRef = useRef(null);
  const pickerRef = useRef(null);
  const draftBeforeEdit = useRef('');
  const typing = useTypingEmitter(conversationId, setTyping);
  const editing = mode?.type === 'edit';

  const closePicker = useCallback(() => setPickerOpen(false), []);
  useClickOutside(pickerRef, closePicker, pickerOpen);

  const trimmed = text.trim();
  const tooLong = text.length > MAX_MESSAGE_LENGTH;
  const canSend = trimmed.length > 0 && !tooLong && !saving;

  // Entering edit mode loads the message text (the draft is restored afterwards).
  useEffect(() => {
    if (mode?.type === 'edit') {
      draftBeforeEdit.current = textareaRef.current?.value ?? '';
      setText(mode.message.body);
    }
    if (mode) textareaRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!editing) drafts.set(conversationId, text);
  }, [conversationId, text, editing]);

  // Focus on desktop only, so the mobile keyboard doesn't pop up on open.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) textareaRef.current?.focus();
  }, [conversationId]);

  // Auto-grow up to MAX_HEIGHT_PX.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  const cancelMode = () => {
    if (editing) setText(draftBeforeEdit.current);
    onCancelMode();
  };

  const send = async () => {
    if (!canSend) return;
    typing.stop();
    if (editing) {
      setSaving(true);
      try {
        await editMessage(mode.message, trimmed);
        setText(draftBeforeEdit.current);
        onCancelMode();
      } catch (error) {
        toast.error(error.message);
      } finally {
        setSaving(false);
      }
      return;
    }
    sendMessage(conversationId, trimmed, mode?.type === 'reply' ? mode.message : null);
    setText('');
    if (mode) onCancelMode();
    textareaRef.current?.focus();
  };

  // ---- voice messages ----
  const setRecordingActivity = useCallback((active) => setTyping(conversationId, active, 'recording'), [conversationId, setTyping]);

  const sendVoice = useCallback(
    ({ blob, durationMs, mimeType }) => {
      setRecording(false);
      if (durationMs < 700) return toast.show('Hold on a little longer to record a voice message');
      const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      const item = {
        localId: crypto.randomUUID?.() ?? String(Date.now()),
        kind: 'voice',
        name: `voice-message.${ext}`,
        blob,
        size: blob.size,
        mimeType,
        durationMs,
        previewUrl: URL.createObjectURL(blob),
      };
      sendAttachments(conversationId, [item], '', mode?.type === 'reply' ? mode.message : null);
      if (mode) onCancelMode();
      return undefined;
    },
    [conversationId, mode, onCancelMode, sendAttachments, toast],
  );

  const recordingError = useCallback(
    (message) => {
      setRecording(false);
      toast.error(message);
    },
    [toast],
  );

  /** Pasting images/files from the clipboard opens the send dialog. */
  const onPaste = (event) => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length && !editing) {
      event.preventDefault();
      onPickFiles(files);
    }
  };

  const insertEmoji = (emoji) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    if (!editing) typing.onInput(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  // ---- GIFs and stickers: sent straight away, like WhatsApp ----
  const replyTarget = mode?.type === 'reply' ? mode.message : null;
  const afterQuickSend = () => {
    setPickerOpen(false);
    if (mode) onCancelMode();
  };

  const sendGif = (gif) => {
    const preview = { kind: 'image', mimeType: 'image/gif', name: 'GIF.gif', width: gif.width, height: gif.height, previewUrl: gif.previewUrl };
    sendPrepared(conversationId, preview, () => gifsApi.attach(conversationId, gif.id).then((r) => r.attachment), replyTarget);
    afterQuickSend();
  };

  const sendRecentGif = (gif) => {
    const preview = { kind: 'image', mimeType: 'image/gif', name: 'GIF.gif', width: gif.width, height: gif.height, previewUrl: gif.url };
    // An encrypted GIF is shared again on the server; its key goes into the new (encrypted) message.
    sendPrepared(conversationId, preview, () => gifsApi.reuse(conversationId, gif.id).then((r) => r.attachment), replyTarget, gif.meta ?? null);
    afterQuickSend();
  };

  const sendBuiltinSticker = (value) => {
    sendSticker(conversationId, value, replyTarget);
    afterQuickSend();
  };

  const sendMySticker = (sticker) => {
    const preview = { kind: 'sticker', mimeType: sticker.mimeType, width: sticker.width, height: sticker.height, previewUrl: sticker.url };
    sendPrepared(conversationId, preview, () => stickersApi.prepare(sticker.id, conversationId).then((r) => r.attachment), replyTarget);
    afterQuickSend();
  };

  // ---- smart replies: send as-is, or put in the box to edit first ----
  const sendSuggestion = (reply) => {
    typing.stop();
    sendMessage(conversationId, reply, replyTarget);
    if (mode) onCancelMode();
  };

  const editSuggestion = (reply) => {
    setText(reply);
    typing.onInput(reply);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(reply.length, reply.length);
    });
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && mode) {
      event.preventDefault();
      cancelMode();
      return;
    }
    // Enter sends, Shift+Enter adds a newline (not while composing IME input).
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="safe-bottom border-t border-line bg-surface px-3 pt-2 sm:px-gutter-lg">
      <div className="mx-auto max-w-3xl">
        <SmartReplies
          conversationId={conversationId}
          me={me}
          hidden={editing || recording || trimmed.length > 0}
          onSend={sendSuggestion}
          onEdit={editSuggestion}
        />
        {mode && (
          <div className="mb-2 flex items-start gap-3 rounded-control border-l-4 border-brand-500 bg-brand-50 px-3 py-2">
            {editing ? (
              <Pencil className="mt-0.5 size-4 text-brand-600" aria-hidden />
            ) : (
              <Reply className="mt-0.5 size-4 text-brand-600" aria-hidden />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-brand-700">
                {editing ? 'Edit message' : `Replying to ${mode.message.senderId === me ? 'yourself' : (mode.message.senderName ?? peerName)}`}
              </p>
              <p className="line-clamp-2 break-words text-ink-muted">{messagePreview(mode.message)}</p>
            </div>
            <IconButton icon={X} label={editing ? 'Cancel editing' : 'Cancel reply'} size="sm" onClick={cancelMode} />
          </div>
        )}

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          {recording ? (
            <VoiceRecorder
              onSend={sendVoice}
              onCancel={() => setRecording(false)}
              onError={recordingError}
              onActivity={setRecordingActivity}
            />
          ) : (
            <>
              <div className="relative" ref={pickerRef}>
                <IconButton
                  icon={Smile}
                  label={editing ? 'Emoji' : 'Emoji, GIFs and stickers'}
                  className="size-control"
                  onClick={() => setPickerOpen((open) => !open)}
                  aria-expanded={pickerOpen}
                />
                {pickerOpen && (
                  <div className="absolute bottom-full left-0 z-30 mb-2">
                    <ExpressionPicker
                      mediaAllowed={!editing}
                      onEmoji={insertEmoji}
                      onGif={sendGif}
                      onRecentGif={sendRecentGif}
                      onSticker={sendBuiltinSticker}
                      onMySticker={sendMySticker}
                    />
                  </div>
                )}
              </div>
              {!editing && <AttachmentMenu onPick={onPickFiles} onShareLocation={onShareLocation} />}
              <div className="relative flex-1">
                <label htmlFor="composer" className="sr-only">
                  Message
                </label>
                <textarea
                  id="composer"
                  ref={textareaRef}
                  rows={1}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    if (!editing) typing.onInput(event.target.value);
                  }}
                  onKeyDown={onKeyDown}
                  onPaste={onPaste}
                  onBlur={typing.stop}
                  placeholder={editing ? 'Edit your message' : 'Type a message'}
                  className={cn(
                    'scrollbar-thin block w-full resize-none rounded-pill border border-line bg-surface-muted px-4 py-2.5 text-message text-ink',
                    'outline-none placeholder:text-ink-faint focus:border-brand-300 focus:bg-surface focus:shadow-focus',
                    tooLong && 'border-danger focus:border-danger',
                  )}
                  aria-invalid={tooLong || undefined}
                />
                {text.length > MAX_MESSAGE_LENGTH - 200 && (
                  <span className={cn('absolute -top-5 right-2 text-2xs', tooLong ? 'text-danger' : 'text-ink-faint')}>
                    {text.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                )}
              </div>
              {!editing && !trimmed && canRecordVoice() ? (
                <IconButton icon={Mic} label="Record voice message" variant="primary" className="size-control" onClick={() => setRecording(true)} />
              ) : (
                <IconButton
                  type="submit"
                  icon={editing ? Check : SendHorizontal}
                  label={editing ? 'Save edit' : 'Send message'}
                  variant="primary"
                  className="size-control"
                  disabled={!canSend}
                />
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
});
