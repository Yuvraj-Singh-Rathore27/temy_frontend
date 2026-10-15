const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const longDateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const fullDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(date, now = new Date()) {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY);
}

/** "14:05" */
export function formatTime(value) {
  return value ? timeFormat.format(new Date(value)) : '';
}

/** Compact timestamp for the conversation list: time today, weekday this week, date otherwise. */
export function formatListTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = daysAgo(date);
  if (diff === 0) return timeFormat.format(date);
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return weekdayFormat.format(date);
  if (date.getFullYear() === new Date().getFullYear()) return shortDateFormat.format(date);
  return fullDateFormat.format(date);
}

/** Separator label in the message list. */
export function formatDayLabel(value) {
  const date = new Date(value);
  const diff = daysAgo(date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (date.getFullYear() === new Date().getFullYear()) return longDateFormat.format(date);
  return fullDateFormat.format(date);
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** "last seen 5 min ago" style presence text. */
export function formatLastSeen(value) {
  if (!value) return 'Offline';
  const date = new Date(value);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Last seen just now';
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  const diff = daysAgo(date);
  if (diff === 0) return `Last seen today at ${timeFormat.format(date)}`;
  if (diff === 1) return `Last seen yesterday at ${timeFormat.format(date)}`;
  return `Last seen ${fullDateFormat.format(date)}`;
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
