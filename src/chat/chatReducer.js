/**
 * Chat state. The server (SQL) is the source of truth; this is a cache that is
 * kept current by socket events and re-synced after reconnects.
 */
export const initialChatState = {
  me: null,
  connection: 'connecting', // connecting | connected | reconnecting | offline
  conversations: {}, // id -> conversation
  conversationsStatus: 'idle', // idle | loading | ready | error
  conversationsError: null,
  contacts: [],
  contactsStatus: 'idle',
  contactsError: null,
  threads: {}, // conversationId -> { items, hasMore, status, error, loadingOlder }
  typing: {}, // conversationId -> { userId: true }
  pins: {}, // conversationId -> [{ messageId, senderId, body, pinnedAt, … }]
  myLiveShares: {}, // messageId -> { conversationId, liveUntil, tracking } for my running live locations
  settings: null, // { notificationsEnabled, messagePreview, soundEnabled, push: { available, publicKey } }
  notificationsUnread: 0,
  wallpapers: [], // my uploaded wallpapers: [{ id, value: 'custom:<id>', url, absoluteUrl }]
  groups: {}, // conversationId -> group info { name, members: [{ id, name, role, … }], myRole, inviteCode, … }
  presence: {}, // userId -> { isOnline, lastSeenAt }
};

const STATUS_RANK = { failed: -1, pending: 0, sent: 1, delivered: 2, read: 3 };

export const emptyThread = { items: [], hasMore: false, status: 'idle', error: null, loadingOlder: false };

/** Merge server messages into a thread: dedupe by id and by clientId (replacing optimistic copies). */
function mergeMessages(existing, incoming) {
  const byKey = new Map();
  const keyOf = (m) => (m.id ? `id:${m.id}` : `c:${m.clientId}`);
  for (const message of existing) byKey.set(keyOf(message), message);
  for (const message of incoming) {
    if (message.clientId) byKey.delete(`c:${message.clientId}`);
    const current = byKey.get(keyOf(message));
    // Never downgrade a status we already learnt from a receipt.
    byKey.set(
      keyOf(message),
      current && STATUS_RANK[current.status] > STATUS_RANK[message.status] ? { ...message, ...pickStatus(current) } : message,
    );
  }
  return [...byKey.values()].sort(compareMessages);
}

const pickStatus = ({ status, deliveredAt, readAt }) => ({ status, deliveredAt, readAt });

/** Saved messages by id; optimistic (unsaved) ones last, in send order. */
function compareMessages(a, b) {
  if (a.id && b.id) return a.id - b.id;
  if (a.id) return -1;
  if (b.id) return 1;
  return a.localCreatedAt - b.localCreatedAt;
}

function applyReceipt(message, receipt, me) {
  if (!message.id || message.senderId !== me || message.id > receipt.upToMessageId) return message;
  if (STATUS_RANK[message.status] >= STATUS_RANK[receipt.status]) return message;
  return {
    ...message,
    status: receipt.status,
    deliveredAt: message.deliveredAt ?? receipt.at,
    readAt: receipt.status === 'read' ? receipt.at : message.readAt,
  };
}

function updateThread(state, conversationId, fn) {
  const thread = state.threads[conversationId] ?? emptyThread;
  return { ...state, threads: { ...state.threads, [conversationId]: fn(thread) } };
}

function updateConversation(state, id, fn) {
  const conversation = state.conversations[id];
  if (!conversation) return state;
  return { ...state, conversations: { ...state.conversations, [id]: fn(conversation) } };
}

const pickProfile = ({ name, about, status, avatarUrl }) => ({ name, about, status, avatarUrl });

/** Apply `patch` to a user wherever they appear (conversation peers, contacts). Untouched objects keep their identity. */
function patchUser(state, userId, patch) {
  let conversations = state.conversations;
  for (const conversation of Object.values(state.conversations)) {
    if (conversation.peer?.id !== userId) continue;
    if (conversations === state.conversations) conversations = { ...state.conversations };
    conversations[conversation.id] = { ...conversation, peer: { ...conversation.peer, ...patch } };
  }
  const index = state.contacts.findIndex((c) => c.id === userId);
  let contacts = state.contacts;
  if (index !== -1) {
    contacts = [...state.contacts];
    contacts[index] = { ...contacts[index], ...patch };
  }
  return conversations === state.conversations && contacts === state.contacts ? state : { ...state, conversations, contacts };
}

function upsertConversations(state, list, { replace = false } = {}) {
  const next = replace ? {} : { ...state.conversations };
  for (const conversation of list) next[conversation.id] = conversation;
  // Remember presence reported by the server.
  const presence = { ...state.presence };
  for (const { peer } of list) {
    if (peer && !presence[peer.id]) presence[peer.id] = { isOnline: peer.isOnline, lastSeenAt: peer.lastSeenAt };
  }
  return { ...state, conversations: next, presence };
}

export function chatReducer(state, action) {
  switch (action.type) {
    case 'reset':
      return { ...initialChatState, me: action.me };

    case 'connection':
      return { ...state, connection: action.status };

    // ---- Conversations ----
    case 'conversations/loading':
      return { ...state, conversationsStatus: state.conversationsStatus === 'ready' ? 'ready' : 'loading', conversationsError: null };
    case 'conversations/loaded': {
      // Server presence is authoritative right after a (re)load.
      const presence = { ...state.presence };
      for (const { peer } of action.conversations) {
        if (peer) presence[peer.id] = { isOnline: peer.isOnline, lastSeenAt: peer.lastSeenAt };
      }
      return {
        ...upsertConversations(state, action.conversations, { replace: true }),
        presence,
        conversationsStatus: 'ready',
        conversationsError: null,
      };
    }
    case 'conversations/error':
      return { ...state, conversationsStatus: state.conversationsStatus === 'ready' ? 'ready' : 'error', conversationsError: action.error };
    case 'conversation/upsert':
      return upsertConversations(state, [action.conversation]);
    case 'conversation/markedRead':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, unreadCount: 0 }));

    // ---- Contacts ----
    case 'contacts/loading':
      return { ...state, contactsStatus: state.contactsStatus === 'ready' ? 'ready' : 'loading', contactsError: null };
    case 'contacts/loaded': {
      const presence = { ...state.presence };
      for (const c of action.contacts) presence[c.id] = { isOnline: c.isOnline, lastSeenAt: c.lastSeenAt };
      return { ...state, contacts: action.contacts, contactsStatus: 'ready', contactsError: null, presence };
    }
    case 'contacts/error':
      return { ...state, contactsStatus: state.contactsStatus === 'ready' ? 'ready' : 'error', contactsError: action.error };
    case 'contacts/added': {
      const others = state.contacts.filter((c) => c.id !== action.contact.id);
      const contacts = [...others, action.contact].sort((a, b) => a.name.localeCompare(b.name));
      let next = { ...state, contacts };
      for (const conversation of Object.values(state.conversations)) {
        if (conversation.peer?.id === action.contact.id) {
          next = updateConversation(next, conversation.id, (c) => ({ ...c, peer: { ...c.peer, isContact: true } }));
        }
      }
      return next;
    }
    case 'contacts/removed': {
      let next = { ...state, contacts: state.contacts.filter((c) => c.id !== action.userId) };
      for (const conversation of Object.values(state.conversations)) {
        if (conversation.peer?.id === action.userId) {
          next = updateConversation(next, conversation.id, (c) => ({ ...c, peer: { ...c.peer, isContact: false } }));
        }
      }
      return next;
    }

    // ---- Message threads ----
    case 'thread/loading':
      return updateThread(state, action.conversationId, (t) => ({ ...t, status: t.status === 'ready' ? 'ready' : 'loading', error: null }));
    case 'thread/loaded':
      return updateThread(state, action.conversationId, (t) => ({
        ...t,
        items: mergeMessages(t.items, action.messages),
        hasMore: action.hasMore,
        status: 'ready',
        error: null,
      }));
    case 'thread/error':
      return updateThread(state, action.conversationId, (t) => ({ ...t, status: t.status === 'ready' ? 'ready' : 'error', error: action.error }));
    case 'thread/olderLoading':
      return updateThread(state, action.conversationId, (t) => ({ ...t, loadingOlder: true }));
    case 'thread/olderLoaded':
      return updateThread(state, action.conversationId, (t) => ({
        ...t,
        items: mergeMessages(t.items, action.messages),
        hasMore: action.hasMore,
        loadingOlder: false,
        error: null,
      }));
    case 'thread/olderError':
      return updateThread(state, action.conversationId, (t) => ({ ...t, loadingOlder: false, error: action.error }));
    case 'thread/caughtUp':
      // Newer messages fetched after a reconnect.
      return updateThread(state, action.conversationId, (t) => ({ ...t, items: mergeMessages(t.items, action.messages) }));

    // ---- Messages ----
    case 'message/pending': {
      const { message } = action;
      return updateThread(state, message.conversationId, (t) => ({ ...t, items: mergeMessages(t.items, [message]) }));
    }
    case 'message/failed':
      return updateThread(state, action.conversationId, (t) => ({
        ...t,
        items: t.items.map((m) => (!m.id && m.clientId === action.clientId ? { ...m, status: 'failed', error: action.error } : m)),
      }));
    case 'message/retrying':
      return updateThread(state, action.conversationId, (t) => ({
        ...t,
        items: t.items.map((m) => (!m.id && m.clientId === action.clientId ? { ...m, status: 'pending', error: null } : m)),
      }));
    case 'message/uploadProgress':
      return updateThread(state, action.conversationId, (t) => ({
        ...t,
        items: t.items.map((m) =>
          !m.id && m.clientId === action.clientId
            ? { ...m, attachments: m.attachments.map((a) => (a.localId === action.localId ? { ...a, progress: action.progress } : a)) }
            : m,
        ),
      }));
    case 'message/uploaded':
      return updateThread(state, action.conversationId, (t) => ({
        ...t,
        items: t.items.map((m) =>
          !m.id && m.clientId === action.clientId
            ? { ...m, uploading: false, attachmentIds: action.attachmentIds, attachmentMeta: action.attachmentMeta ?? m.attachmentMeta }
            : m,
        ),
      }));
    case 'message/discard':
      return updateThread(state, action.conversationId, (t) => ({
        ...t,
        items: t.items.filter((m) => m.id || m.clientId !== action.clientId),
      }));
    case 'message/received': {
      const { message, countUnread } = action;
      let next = state;
      // Also merge while the first page is loading, so a message racing the fetch is not lost.
      const threadStatus = state.threads[message.conversationId]?.status;
      if (threadStatus === 'ready' || threadStatus === 'loading') {
        next = updateThread(next, message.conversationId, (t) => ({ ...t, items: mergeMessages(t.items, [message]) }));
      }
      next = updateConversation(next, message.conversationId, (c) => {
        const isNewer = !c.lastMessage || message.id >= c.lastMessage.id;
        return {
          ...c,
          lastMessage: isNewer ? message : c.lastMessage,
          lastMessageAt: isNewer ? message.createdAt : c.lastMessageAt,
          unreadCount: countUnread ? c.unreadCount + 1 : c.unreadCount,
        };
      });
      // A message from someone means they stopped typing.
      if (next.typing[message.conversationId]?.[message.senderId]) {
        const { [message.senderId]: _, ...rest } = next.typing[message.conversationId];
        next = { ...next, typing: { ...next.typing, [message.conversationId]: rest } };
      }
      return next;
    }
    case 'message/receipt': {
      const { receipt } = action;
      if (receipt.byUserId === state.me) {
        // Another tab/device of mine read the conversation.
        return receipt.status === 'read'
          ? updateConversation(state, receipt.conversationId, (c) => ({ ...c, unreadCount: 0 }))
          : state;
      }
      let next = updateThread(state, receipt.conversationId, (t) => ({
        ...t,
        items: t.items.map((m) => applyReceipt(m, receipt, state.me)),
      }));
      next = updateConversation(next, receipt.conversationId, (c) =>
        c.lastMessage ? { ...c, lastMessage: applyReceipt(c.lastMessage, receipt, state.me) } : c,
      );
      return next;
    }

    // ---- Message actions ----
    case 'message/updated': {
      // Edited or deleted for everyone. Stars are private, so keep ours.
      const { message } = action;
      const quote = message.deletedAt ? { body: '', deleted: true } : { body: message.body };
      let next = updateThread(state, message.conversationId, (t) => ({
        ...t,
        items: t.items.map((m) => {
          if (m.id === message.id) {
            // Ticks never go backwards (an edit broadcast may carry an older status).
            const status = STATUS_RANK[m.status] > STATUS_RANK[message.status] ? m.status : message.status;
            return { ...message, status, starred: message.deletedAt ? false : m.starred };
          }
          if (m.replyTo?.id === message.id) return { ...m, replyTo: { ...m.replyTo, ...quote } };
          return m;
        }),
      }));
      next = updateConversation(next, message.conversationId, (c) =>
        c.lastMessage?.id === message.id ? { ...c, lastMessage: { ...c.lastMessage, ...message } } : c,
      );
      if (message.deletedAt && next.pins[message.conversationId]) {
        next = { ...next, pins: { ...next.pins, [message.conversationId]: next.pins[message.conversationId].filter((p) => p.messageId !== message.id) } };
      }
      return next;
    }
    case 'message/hidden': {
      const { conversationId, messageId } = action;
      let next = updateThread(state, conversationId, (t) => ({ ...t, items: t.items.filter((m) => m.id !== messageId) }));
      next = updateConversation(next, conversationId, (c) => {
        if (c.lastMessage?.id !== messageId) return c;
        // Fall back to the newest message still on screen (the provider refetches if there is none).
        const previous = [...(next.threads[conversationId]?.items ?? [])].reverse().find((m) => m.id);
        return { ...c, lastMessage: previous ?? null };
      });
      return next;
    }
    case 'message/reactions': {
      const { conversationId, messageId, reactions } = action;
      return updateThread(state, conversationId, (t) => ({
        ...t,
        items: t.items.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
      }));
    }
    case 'message/starred': {
      const { conversationId, messageId, starred } = action;
      return updateThread(state, conversationId, (t) => ({
        ...t,
        items: t.items.map((m) => (m.id === messageId && m.starred !== starred ? { ...m, starred } : m)),
      }));
    }
    case 'location/updated': {
      const { conversationId, messageId, location } = action;
      let next = updateThread(state, conversationId, (t) => ({
        ...t,
        items: t.items.map((m) => (m.id === messageId ? { ...m, location } : m)),
      }));
      next = updateConversation(next, conversationId, (c) =>
        c.lastMessage?.id === messageId ? { ...c, lastMessage: { ...c.lastMessage, location } } : c,
      );
      return next;
    }
    case 'live/added':
      return { ...state, myLiveShares: { ...state.myLiveShares, [action.messageId]: action.share } };
    case 'live/removed': {
      if (!state.myLiveShares[action.messageId]) return state;
      const { [action.messageId]: _, ...rest } = state.myLiveShares;
      return { ...state, myLiveShares: rest };
    }
    case 'settings/loaded':
      return { ...state, settings: action.settings };
    case 'group/info':
      return { ...state, groups: { ...state.groups, [action.conversationId]: action.info } };
    case 'conversation/removed': {
      // I left or was removed from a group: it disappears with its history.
      const { [action.conversationId]: _c, ...conversations } = state.conversations;
      const { [action.conversationId]: _t, ...threads } = state.threads;
      const { [action.conversationId]: _g, ...groups } = state.groups;
      return { ...state, conversations, threads, groups };
    }
    case 'wallpapers/loaded':
      return { ...state, wallpapers: action.wallpapers };
    case 'conversation/wallpaper':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, wallpaper: action.wallpaper }));
    case 'conversation/muted':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, mutedUntil: action.mutedUntil }));
    case 'notifications/unread':
      return { ...state, notificationsUnread: action.count };
    case 'notifications/increment':
      return { ...state, notificationsUnread: state.notificationsUnread + 1 };
    case 'pins/loaded':
      return { ...state, pins: { ...state.pins, [action.conversationId]: action.pins } };

    // ---- Other users' profiles & blocks ----
    case 'user/updated':
      return patchUser(state, action.user.id, pickProfile(action.user));
    case 'block/updated':
      return patchUser(state, action.userId, { isBlocked: action.blocked });

    // ---- Typing & presence ----
    case 'typing': {
      // Stored value is the activity: 'typing' or 'recording' (a voice message).
      const { conversationId, userId, isTyping, activity = 'typing' } = action;
      const current = state.typing[conversationId] ?? {};
      const next = isTyping ? activity : undefined;
      if (current[userId] === next) return state;
      const updated = { ...current };
      if (isTyping) updated[userId] = activity;
      else delete updated[userId];
      return { ...state, typing: { ...state.typing, [conversationId]: updated } };
    }
    case 'typing/clearAll':
      return { ...state, typing: {} };
    case 'presence':
      return {
        ...state,
        presence: {
          ...state.presence,
          [action.userId]: {
            isOnline: action.isOnline,
            lastSeenAt: action.lastSeenAt ?? state.presence[action.userId]?.lastSeenAt ?? null,
          },
        },
      };

    default:
      return state;
  }
}

// ---- Selectors ----
// They return the *same* object when nothing relevant changed, so React.memo'd rows
// can skip re-rendering. Call them inside useMemo keyed on the slices they read.

const sameStatus = (target, presence) =>
  !presence || (target.isOnline === presence.isOnline && target.lastSeenAt === presence.lastSeenAt);

/** Conversation with live presence applied to its peer. Reads: presence. */
export function withPresence(presenceMap, conversation) {
  if (!conversation?.peer) return conversation; // groups have no single presence
  const presence = presenceMap[conversation.peer.id];
  if (sameStatus(conversation.peer, presence)) return conversation;
  return { ...conversation, peer: { ...conversation.peer, ...presence } };
}

const activityTime = (c) => new Date(c.lastMessageAt ?? c.createdAt).getTime();

/** Conversations, most recent first. Reads: conversations, presence. */
export function selectConversationList(conversations, presenceMap) {
  return Object.values(conversations)
    .map((c) => withPresence(presenceMap, c))
    .sort((a, b) => activityTime(b) - activityTime(a));
}

/** Contacts with live presence and their conversation (for last message / unread). Reads: contacts, presence, conversations. */
export function selectContacts(contacts, presenceMap, conversations) {
  const byPeer = new Map(Object.values(conversations).filter((c) => c.peer).map((c) => [c.peer.id, c]));
  return contacts.map((contact) => {
    const presence = presenceMap[contact.id];
    return {
      contact: sameStatus(contact, presence) ? contact : { ...contact, ...presence },
      conversation: byPeer.get(contact.id) ?? null,
    };
  });
}

export function selectTotalUnread(conversations) {
  return Object.values(conversations).reduce((sum, c) => sum + c.unreadCount, 0);
}
