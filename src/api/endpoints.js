import { decryptConversation, decryptMessages, decryptPin, searchLocal, warmSearch } from '../e2ee/session.js';
import { http, request } from './client.js';

// End-to-end encrypted messages are decrypted right here, as they arrive from the server,
// so the rest of the app only ever sees readable messages.
const withMessages = (promise) => promise.then(async (r) => ({ ...r, messages: await decryptMessages(r.messages) }));

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const authApi = {
  register: (data) => http.post('/auth/register', data, { auth: false }),
  verifyEmail: (email, code) => http.post('/auth/verify-email', { email, code }, { auth: false }),
  resendVerification: (email) => http.post('/auth/resend-verification', { email }, { auth: false }),
  forgotPassword: (email) => http.post('/auth/forgot-password', { email }, { auth: false }),
  resetPassword: (data) => http.post('/auth/reset-password', data, { auth: false }),
  login: (data) => http.post('/auth/login', data, { auth: false }),
  logout: () => http.post('/auth/logout', undefined, { auth: false }),
  logoutAll: () => http.post('/auth/logout-all'),
  me: () => http.get('/auth/me'),
};

export const usersApi = {
  search: (q, { signal } = {}) => http.get(`/users/search${qs({ q })}`, { signal }),
  get: (userId) => http.get(`/users/${encodeURIComponent(userId)}`),
};

export const profileApi = {
  get: () => http.get('/profile'),
  update: (fields) => http.patch('/profile', fields),
  setAvatar: (blob) => {
    const form = new FormData();
    form.append('avatar', blob, 'avatar');
    return http.put('/profile/avatar', form);
  },
  removeAvatar: () => http.delete('/profile/avatar'),
  exportData: () => http.get('/profile/export'),
  deleteAccount: (password) => http.post('/profile/delete', { password }),
};

export const blocksApi = {
  list: () => http.get('/blocks'),
  block: (userId) => http.post('/blocks', { userId }),
  unblock: (userId) => http.delete(`/blocks/${encodeURIComponent(userId)}`),
};

export const contactsApi = {
  list: () => http.get('/contacts'),
  add: (userId) => http.post('/contacts', { userId }),
  remove: (userId) => http.delete(`/contacts/${encodeURIComponent(userId)}`),
};

export const conversationsApi = {
  list: () => http.get('/conversations').then(async (r) => ({ ...r, conversations: await Promise.all(r.conversations.map(decryptConversation)) })),
  get: (id) => http.get(`/conversations/${encodeURIComponent(id)}`).then(async (r) => ({ ...r, conversation: await decryptConversation(r.conversation) })),
  open: (userId) => http.post('/conversations', { userId }),
  messages: (id, { before, after, limit } = {}) =>
    withMessages(http.get(`/conversations/${encodeURIComponent(id)}/messages${qs({ before, after, limit })}`)),
  /** REST fallback for sending. `payload`: { body?, clientId, replyToId?, attachmentIds?, location?, sticker?, encrypted?, … } */
  send: (id, payload) => http.post(`/conversations/${encodeURIComponent(id)}/messages`, payload),
  /** type: 'media' | 'files' | 'audio' */
  attachments: async (id, { type, before } = {}) => {
    const result = await http.get(`/conversations/${encodeURIComponent(id)}/attachments${qs({ type, before })}`);
    // Encrypted files: their keys and real names are inside their messages, so decrypt those.
    const messageIds = [...new Set(result.items.filter((item) => item.encrypted).map((item) => item.messageId))];
    if (messageIds.length === 0) return result;
    const decrypted = new Map();
    for (let i = 0; i < messageIds.length; i += 100) {
      const { messages } = await withMessages(http.get(`/messages/batch?ids=${messageIds.slice(i, i + 100).join(',')}`));
      for (const message of messages) for (const attachment of message.attachments ?? []) decrypted.set(attachment.id, attachment);
    }
    return {
      ...result,
      items: result.items
        .filter((item) => !item.encrypted || decrypted.has(item.id)) // sent before this device existed: can't be shown
        .map((item) => (decrypted.has(item.id) ? { ...item, ...decrypted.get(item.id), messageId: item.messageId, senderId: item.senderId, senderName: item.senderName, createdAt: item.createdAt } : item)),
    };
  },
  pins: (id) =>
    http.get(`/conversations/${encodeURIComponent(id)}/pins`).then(async (r) => ({ ...r, pins: await Promise.all(r.pins.map((pin) => decryptPin(pin, Number(id)))) })),
  /** duration: '8h' | '1w' | 'always' */
  mute: (id, duration) => http.put(`/conversations/${encodeURIComponent(id)}/mute`, { duration }),
  unmute: (id) => http.delete(`/conversations/${encodeURIComponent(id)}/mute`),
  markRead: (id, messageId) => http.post(`/conversations/${encodeURIComponent(id)}/read`, { messageId }),
};

const messagePath = (id, suffix = '') => `/messages/${encodeURIComponent(id)}${suffix}`;

export const messagesApi = {
  /** `change`: { body } for plaintext messages or { encrypted } for end-to-end encrypted ones. */
  edit: (id, change) => http.patch(messagePath(id), change),
  batch: (ids) => withMessages(http.get(`/messages/batch?ids=${ids.join(',')}`)),
  /** scope: 'me' | 'everyone' */
  remove: (id, scope) => http.delete(`${messagePath(id)}?scope=${scope}`),
  react: (id, emoji) => http.put(messagePath(id, '/reaction'), { emoji }),
  unreact: (id) => http.delete(messagePath(id, '/reaction')),
  star: (id) => http.put(messagePath(id, '/star')),
  unstar: (id) => http.delete(messagePath(id, '/star')),
  pin: (id) => http.put(messagePath(id, '/pin')),
  unpin: (id) => http.delete(messagePath(id, '/pin')),
  forward: (id, conversationIds) => http.post(messagePath(id, '/forward'), { conversationIds }),
  /**
   * Search: the server finds older, unencrypted messages; encrypted ones are
   * searched on this device (their text is only readable here). Results merged, newest first.
   */
  search: async (q, { conversationId, signal } = {}) => {
    const [server, local] = await Promise.all([
      withMessages(http.get(`/messages/search${qs({ q, conversationId })}`, { signal })),
      searchLocal(q, { conversationId: conversationId ? Number(conversationId) : undefined }),
    ]);
    const byId = new Map(server.messages.map((m) => [m.id, m]));
    for (const hit of local) {
      if (!byId.has(hit.id)) byId.set(hit.id, { id: hit.id, conversationId: hit.conversationId, senderId: hit.senderId, body: hit.text, createdAt: hit.createdAt, attachments: [] });
    }
    return { messages: [...byId.values()].sort((a, b) => b.id - a.id).slice(0, 50) };
  },
  warmSearch,
  starred: () => withMessages(http.get('/messages/starred')),
  updateLocation: (id, coords) => http.patch(messagePath(id, '/location'), coords),
  stopLiveLocation: (id) => http.delete(messagePath(id, '/location/live')),
  liveLocations: () => http.get('/messages/live-locations'),
};

export const settingsApi = {
  get: () => http.get('/settings'),
  update: (fields) => http.patch('/settings', fields),
  subscribePush: (subscription) => http.post('/push/subscriptions', subscription),
  unsubscribePush: (endpoint) => request('/push/subscriptions', { method: 'DELETE', body: { endpoint } }),
};

export const notificationsApi = {
  list: ({ before } = {}) => http.get(`/notifications${qs({ before })}`),
  markRead: (ids) => http.post('/notifications/read', { ids }),
};

export const appearanceApi = {
  wallpapers: () => http.get('/wallpapers'),
  uploadWallpaper: (blob) => {
    const form = new FormData();
    form.append('image', blob, 'wallpaper');
    return http.post('/wallpapers', form);
  },
  deleteWallpaper: (id) => http.delete(`/wallpapers/${encodeURIComponent(id)}`),
  /** wallpaper: 'preset:…' | 'custom:<id>' | null (use my default) */
  setChatWallpaper: (conversationId, wallpaper) => http.put(`/conversations/${encodeURIComponent(conversationId)}/wallpaper`, { wallpaper }),
};

const groupPath = (id, suffix = '') => `/groups/${encodeURIComponent(id)}${suffix}`;

export const groupsApi = {
  create: ({ name, description, memberIds }) => http.post('/groups', { name, description, memberIds }),
  get: (id) => http.get(groupPath(id)),
  update: (id, fields) => http.patch(groupPath(id), fields),
  setAvatar: (id, blob) => {
    const form = new FormData();
    form.append('avatar', blob, 'avatar');
    return http.put(groupPath(id, '/avatar'), form);
  },
  removeAvatar: (id) => http.delete(groupPath(id, '/avatar')),
  addMembers: (id, userIds) => http.post(groupPath(id, '/members'), { userIds }),
  removeMember: (id, userId) => http.delete(groupPath(id, `/members/${encodeURIComponent(userId)}`)),
  setRole: (id, userId, role) => http.patch(groupPath(id, `/members/${encodeURIComponent(userId)}`), { role }),
  leave: (id) => http.post(groupPath(id, '/leave')),
  createInvite: (id) => http.post(groupPath(id, '/invite')),
  revokeInvite: (id) => http.delete(groupPath(id, '/invite')),
  previewInvite: (code) => http.get(`/groups/invites/${encodeURIComponent(code)}`),
  join: (code) => http.post(`/groups/invites/${encodeURIComponent(code)}/join`),
};

export const callsApi = {
  history: (before) => http.get(`/calls${qs({ before })}`),
  hide: (callIds) => http.post('/calls/hide', { callIds }),
  clear: () => http.post('/calls/hide', { all: true }),
  /** Group calls going on in my groups. */
  active: () => http.get('/calls/active'),
};

/** Call recordings: started during a call, uploaded in chunks while recording, then finished. */
export const recordingsApi = {
  start: (callId, { kind, mimeType }) => http.post(`/calls/${callId}/recordings`, { kind, mimeType }),
  uploadChunk: (recordingId, seq, blob) => http.put(`/recordings/${recordingId}/chunks/${seq}`, blob),
  finish: (recordingId, durationMs) => http.post(`/recordings/${recordingId}/finish`, { durationMs }),
  remove: (recordingId) => http.delete(`/recordings/${recordingId}`),
};

export const gifsApi = {
  trending: (offset = 0) => http.get(`/gifs/trending${qs({ offset: offset || undefined })}`),
  search: (q, offset = 0) => http.get(`/gifs/search${qs({ q, offset: offset || undefined })}`),
  recent: () => http.get('/gifs/recent'),
  /** Turn a GIPHY GIF into an attachment of mine (the server downloads and stores it). */
  attach: (conversationId, gifId) => http.post('/gifs', { conversationId, gifId }),
  reuse: (conversationId, attachmentId) => http.post('/gifs/reuse', { conversationId, attachmentId }),
};

export const stickersApi = {
  list: () => http.get('/stickers'),
  create: (blob, { width, height } = {}) => {
    const form = new FormData();
    if (width) form.append('width', String(width));
    if (height) form.append('height', String(height));
    form.append('image', blob, blob.type === 'image/png' ? 'sticker.png' : 'sticker.webp');
    return http.post('/stickers', form);
  },
  save: (attachmentId) => http.post('/stickers/save', { attachmentId }),
  remove: (id) => http.delete(`/stickers/${encodeURIComponent(id)}`),
  prepare: (id, conversationId) => http.post(`/stickers/${encodeURIComponent(id)}/send`, { conversationId }),
};

export const e2eeApi = {
  devices: () => http.get('/e2ee/devices'),
  revoke: (id) => http.delete(`/e2ee/devices/${encodeURIComponent(id)}`),
};
