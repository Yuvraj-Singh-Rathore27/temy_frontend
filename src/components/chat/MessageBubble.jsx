import { memo, useMemo, useRef } from 'react';
import { Ban, ChevronDown, Forward, Lock, Phone, PhoneMissed, RotateCw, Star, Trash2, Video } from 'lucide-react';
import { formatTime } from '../../utils/format.js';
import { attachmentLabel, locationLabel } from '../../utils/media.js';
import { groupReactions } from '../../utils/messages.js';
import { LocationBubble } from '../location/LocationBubble.jsx';
import { MessageAttachments } from '../media/MessageAttachments.jsx';
import { avatarColor, cn } from '../../utils/misc.js';
import { eventText, isMissedCall } from '../../utils/conversation.js';
import { SecureImage } from '../media/SecureMedia.jsx';
import { Sticker } from '../stickers/Sticker.jsx';
import { MessageStatus } from './MessageStatus.jsx';

const LONG_PRESS_MS = 450;

/** Why an end-to-end encrypted message can't be shown on this device. */
const UNDECRYPTABLE = {
  'no-key': 'This message was sent before you set up TEMU on this device, so it can only be read on your other devices.',
  failed: "This message couldn't be decrypted.",
  unavailable: 'Open TEMU over HTTPS to read encrypted messages.',
  'not-ready': 'Decrypting…',
};
const MENTION = /(@[\p{L}\p{N}_]+)/u;

/** Message text with @mentions emphasised (still plain text — no HTML is ever interpreted). */
function withMentions(text, mine) {
  if (!text.includes('@')) return text;
  return text.split(MENTION).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className={cn('font-semibold', mine ? 'text-white underline decoration-white/50' : 'text-brand-700')}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/**
 * One chat bubble. Message text is rendered as plain text (React escapes it),
 * never as HTML, so user content cannot inject markup.
 *
 * Memoized: the reducer keeps unchanged message objects by reference, so only
 * bubbles whose message (or grouping/highlight) actually changed re-render.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  me,
  peerName,
  isGroupChat = false,
  groupedWithPrev,
  groupedWithNext,
  highlighted,
  onRetry,
  onDiscard,
  onOpenMenu,
  onJump,
  onReact,
  onOpenMedia,
}) {
  const mine = message.senderId === me;
  const failed = message.status === 'failed';
  const deleted = Boolean(message.deletedAt);
  // Stickers (built-in, or a custom sticker image) show without a bubble.
  const stickerAttachment = message.attachments?.length === 1 && message.attachments[0].kind === 'sticker' ? message.attachments[0] : null;
  const isSticker = !deleted && Boolean(message.sticker || stickerAttachment);
  const menuEnabled = Boolean(message.id);
  const reactions = useMemo(() => groupReactions(message.reactions, me), [message.reactions, me]);
  const pressTimer = useRef(null);

  const openMenuAt = (x, y) => menuEnabled && onOpenMenu(message, { x, y });

  const onTouchStart = (event) => {
    const touch = event.touches[0];
    pressTimer.current = setTimeout(() => openMenuAt(touch.clientX, touch.clientY), LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  const nameOf = (userId, name) => (userId === me ? 'You' : (name ?? peerName));
  const onBrand = mine && !isSticker; // text sits on the brand-coloured bubble

  // "Alice added Bob", "Group renamed", …
  if (message.event) {
    return (
      <div data-message-id={message.id ?? undefined} className={cn('my-2 flex justify-center', highlighted && 'animate-highlight')}>
        <p
          className={cn(
            'flex max-w-[85%] items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1 text-center text-xs shadow-bubble backdrop-blur',
            message.event.type === 'call' && isMissedCall(message.event.data, me) ? 'text-danger' : 'text-ink-muted',
          )}
        >
          {message.event.type === 'call' && <CallIcon data={message.event.data} me={me} />}
          {eventText(message, me)}
        </p>
      </div>
    );
  }

  return (
    <div
      data-message-id={message.id ?? undefined}
      className={cn('flex animate-fade-in', mine ? 'justify-end' : 'justify-start', groupedWithPrev ? 'mt-0.5' : 'mt-3', reactions.length > 0 && 'mb-3')}
    >
      <div className={cn('flex max-w-[85%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
        <div
          onContextMenu={(event) => {
            if (!menuEnabled) return;
            event.preventDefault();
            openMenuAt(event.clientX, event.clientY);
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={cancelPress}
          onTouchMove={cancelPress}
          className={cn(
            'group relative rounded-bubble transition-shadow',
            isSticker
              ? 'text-ink'
              : cn('px-3.5 pt-2 pb-1.5 shadow-bubble', mine ? 'bg-bubble-out text-bubble-out-ink' : 'bg-bubble-in text-bubble-in-ink'),
            mine && groupedWithNext && 'rounded-br-md',
            mine && groupedWithPrev && 'rounded-tr-md',
            !mine && groupedWithNext && 'rounded-bl-md',
            !mine && groupedWithPrev && 'rounded-tl-md',
            failed && 'opacity-70',
            highlighted && 'animate-highlight',
          )}
        >
          {menuEnabled && (
            <button
              type="button"
              aria-label="Message options"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openMenuAt(rect.left, rect.bottom);
              }}
              // Beside the bubble (never on top of the text or the rounded corner); the padding keeps the hover area joined to the bubble.
              className={cn(
                'absolute top-1/2 hidden -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 sm:block',
                mine ? 'right-full pr-1' : 'left-full pl-1',
              )}
            >
              <span className="block rounded-full bg-surface p-1 text-ink-muted shadow-bubble hover:text-ink">
                <ChevronDown className="size-4" />
              </span>
            </button>
          )}

          {/* Groups: who sent it (once per run of messages from the same person). */}
          {isGroupChat && !mine && !groupedWithPrev && (
            <p className={cn('mb-0.5 text-xs font-semibold', avatarColor(message.senderId).split(' ').find((c) => c.startsWith('text-')))}>
              {message.senderName ?? 'Someone'}
            </p>
          )}
          {message.forwarded && !deleted && (
            <p className={cn('mb-0.5 flex items-center gap-1 text-2xs italic', mine ? 'text-white/75' : 'text-ink-muted')}>
              <Forward className="size-3" aria-hidden /> Forwarded
            </p>
          )}

          {message.replyTo && (
            <button
              type="button"
              onClick={() => onJump(message.replyTo.id)}
              className={cn(
                'mb-1 block w-full min-w-40 rounded-lg border-l-4 px-2.5 py-1.5 text-left text-xs',
                onBrand ? 'border-white/70 bg-white/15 text-white' : 'border-brand-500 bg-brand-50 text-ink-soft',
                isSticker && 'shadow-bubble',
              )}
            >
              <span className={cn('block font-semibold', onBrand ? 'text-white' : 'text-brand-700')}>{nameOf(message.replyTo.senderId, message.replyTo.senderName)}</span>
              <span className="line-clamp-2 break-words whitespace-pre-wrap opacity-90">
                {message.replyTo.deleted
                  ? 'This message was deleted'
                  : message.replyTo.sticker
                    ? '🩷 Sticker'
                    : message.replyTo.body ||
                      (message.replyTo.locationKind
                        ? locationLabel(message.replyTo.locationKind === 'live')
                        : attachmentLabel({ kind: message.replyTo.attachmentKind }))}
              </span>
            </button>
          )}

          {isSticker ? (
            <div className={cn('size-36', message.uploading && 'opacity-60')}>
              {message.sticker ? (
                <Sticker value={message.sticker} size={144} />
              ) : (
                <SecureImage
                  url={stickerAttachment.previewUrl ?? stickerAttachment.url}
                  alt="Sticker"
                  className="size-full object-contain drop-shadow-md"
                  loading="lazy"
                />
              )}
            </div>
          ) : message.undecryptable ? (
            <p className={cn('flex items-start gap-1.5 text-message italic', mine ? 'text-white/80' : 'text-ink-muted')}>
              <Lock className="mt-1 size-4 shrink-0" aria-hidden />
              {UNDECRYPTABLE[message.undecryptable] ?? UNDECRYPTABLE.failed}
            </p>
          ) : deleted ? (
            <p className={cn('flex items-center gap-1.5 text-message italic', mine ? 'text-white/80' : 'text-ink-muted')}>
              <Ban className="size-4" aria-hidden />
              {mine ? 'You deleted this message' : 'This message was deleted'}
            </p>
          ) : (
            <>
              <MessageAttachments message={message} mine={mine} onOpenMedia={onOpenMedia} onCancelUpload={onDiscard} />
              {message.location && !message.location.summaryOnly && <LocationBubble message={message} mine={mine} />}
              {message.body && (
                <p className={cn('pr-4 text-message break-words whitespace-pre-wrap', message.attachments?.length > 0 && 'mt-1.5')}>
                  {withMentions(message.body, mine)}
                </p>
              )}
            </>
          )}

          <div
            className={cn(
              'mt-0.5 flex items-center justify-end gap-1 text-2xs',
              isSticker ? 'ml-auto w-fit rounded-full bg-surface/85 px-1.5 text-ink-muted shadow-sm' : mine ? 'text-white/70' : 'text-ink-faint',
            )}
          >
            {message.starred && <Star className="size-3 fill-current" aria-label="Starred" />}
            {message.editedAt && !deleted && <span>edited</span>}
            <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
              {formatTime(message.createdAt)}
            </time>
            {mine && !deleted && <MessageStatus status={message.status} tone={isSticker ? 'muted' : undefined} />}
          </div>

          {reactions.length > 0 && (
            <div className={cn('absolute -bottom-3.5 flex gap-1', mine ? 'right-2' : 'left-2')}>
              {reactions.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  onClick={() => onReact(message, reaction.emoji)}
                  title={reaction.mine ? 'You reacted — click to remove' : `${reaction.count} reaction${reaction.count > 1 ? 's' : ''}`}
                  className={cn(
                    'flex h-6 items-center gap-0.5 rounded-full border px-1.5 text-xs shadow-sm',
                    reaction.mine ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-line bg-surface text-ink-soft',
                  )}
                >
                  <span className="text-sm leading-none">{reaction.emoji}</span>
                  {reaction.count > 1 && <span>{reaction.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {failed && (
          <div className="mt-1 flex items-center gap-3 text-xs">
            <span className="text-danger">{message.error ?? 'Not sent'}</span>
            <button type="button" onClick={() => onRetry(message)} className="flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700">
              <RotateCw className="size-3" /> Retry
            </button>
            <button type="button" onClick={() => onDiscard(message)} className="flex items-center gap-1 text-ink-muted hover:text-danger">
              <Trash2 className="size-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

function CallIcon({ data, me }) {
  const Icon = isMissedCall(data, me) ? PhoneMissed : data.type === 'video' ? Video : Phone;
  return <Icon className="size-3.5 shrink-0" aria-hidden />;
}
