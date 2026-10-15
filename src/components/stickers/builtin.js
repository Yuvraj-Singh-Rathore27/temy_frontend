/**
 * Built-in sticker packs. Messages store "blob:<name>" or "emoji:<emoji>";
 * the server accepts exactly these names (server/src/utils/stickers.js).
 */
export const BLOB_STICKERS = [
  { name: 'hi', label: 'Hi!' },
  { name: 'love', label: 'Love' },
  { name: 'laugh', label: 'Haha' },
  { name: 'wow', label: 'Wow' },
  { name: 'sad', label: 'Sad' },
  { name: 'cry', label: 'Crying' },
  { name: 'angry', label: 'Angry' },
  { name: 'cool', label: 'Cool' },
  { name: 'party', label: 'Party' },
  { name: 'thanks', label: 'Thanks' },
  { name: 'sleepy', label: 'Sleepy' },
  { name: 'thinking', label: 'Hmm' },
  { name: 'ok', label: 'OK' },
  { name: 'no', label: 'No' },
  { name: 'hug', label: 'Hug' },
  { name: 'shy', label: 'Shy' },
];

export const EMOJI_STICKERS = ['😂', '😍', '🥰', '😎', '🤩', '🥳', '😭', '😡', '👍', '🙏', '👏', '🔥', '❤️', '💯', '🎉', '😴', '🤔', '😱', '🤗', '😘', '🙈', '💪', '✨', '👋'];

/** Accessible name of a built-in sticker value. */
export function stickerLabel(value = '') {
  if (value.startsWith('emoji:')) return `${value.slice(6)} sticker`;
  const blob = BLOB_STICKERS.find((s) => `blob:${s.name}` === value);
  return blob ? `${blob.label} sticker` : 'Sticker';
}
