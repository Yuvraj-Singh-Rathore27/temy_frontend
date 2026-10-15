import { attachmentLabel, locationLabel } from '../utils/media.js';

/** What a message says, in words ("see you at 7", "[photo]", "[location]"). */
export function messageText(message) {
  let text = message.body?.trim();
  if (!text && message.sticker) text = '[sticker]';
  if (!text && message.location) text = `[${locationLabel(message.location.live).replace(/^📍\s*/, '')}]`;
  if (!text && message.attachments?.length) {
    const first = message.attachments[0];
    text = `[${attachmentLabel({ kind: first.kind, count: message.attachments.length, name: first.name }).replace(/^\S+\s/, '')}]`;
  }
  if (!text) return null;
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

/** One message as a line the AI can read ("Ann: see you at 7"); `mention` (a RegExp) becomes "@you". */
export function lineOf(message, nameOf, mention) {
  const text = messageText(message);
  return text ? `${nameOf(message)}: ${mention ? text.replace(mention, '@you') : text}` : null;
}

/** Messages that count as conversation (not system events, deleted or unreadable ones). */
export function realMessages(items) {
  return items.filter((m) => m.id && !m.event && !m.deletedAt && !m.undecryptable);
}
