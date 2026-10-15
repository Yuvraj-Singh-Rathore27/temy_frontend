// Mirrors the server's limits (server/src/config). The server enforces them; these only hide options that would fail.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETE_FOR_EVERYONE_MS = 48 * 60 * 60 * 1000;

const age = (message) => Date.now() - new Date(message.createdAt).getTime();

/** Saved (not optimistic) and not deleted. */
export const isActionable = (message) => Boolean(message?.id) && !message.deletedAt;

const isStickerMessage = (message) => Boolean(message.sticker) || message.attachments?.[0]?.kind === 'sticker';

export const canEdit = (message, me) =>
  isActionable(message) && message.senderId === me && !isStickerMessage(message) && age(message) < EDIT_WINDOW_MS;

export const canDeleteForEveryone = (message, me) =>
  isActionable(message) && message.senderId === me && age(message) < DELETE_FOR_EVERYONE_MS;

/** [{ emoji, count, userIds, mine }] in first-used order. */
export function groupReactions(reactions = [], me) {
  const groups = new Map();
  for (const { emoji, userId } of reactions) {
    if (!groups.has(emoji)) groups.set(emoji, { emoji, count: 0, userIds: [], mine: false });
    const group = groups.get(emoji);
    group.count += 1;
    group.userIds.push(userId);
    if (userId === me) group.mine = true;
  }
  return [...groups.values()];
}
