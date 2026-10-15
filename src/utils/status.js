/** Availability statuses a user can pick (matches the server enum). */
export const STATUSES = [
  { value: 'available', label: 'Available', dot: 'bg-online' },
  { value: 'busy', label: 'Busy', dot: 'bg-danger' },
  { value: 'away', label: 'Away', dot: 'bg-warning' },
  { value: 'dnd', label: 'Do not disturb', dot: 'bg-ink-soft' },
];

const BY_VALUE = Object.fromEntries(STATUSES.map((s) => [s.value, s]));

export const statusInfo = (value) => BY_VALUE[value] ?? BY_VALUE.available;
