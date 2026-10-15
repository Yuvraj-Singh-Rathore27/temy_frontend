import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import { refreshSession } from '../api/client.js';
import { blocksApi, contactsApi, conversationsApi, messagesApi } from '../api/endpoints.js';
import { uploadAttachment } from '../api/files.js';
import { useNavigate } from 'react-router-dom';
import { appearanceApi, groupsApi, notificationsApi, settingsApi } from '../api/endpoints.js';
import { chatAvatar, chatTitle, isGroup, isMissedCall } from '../utils/conversation.js';
import { assetUrl } from '../api/client.js';
import { applyAppearance } from '../utils/appearance.js';
import { Avatar } from '../components/ui/Avatar.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { canUseLocation, distanceMeters, locationPermission, toCoords } from '../utils/location.js';
import { messagePreview } from '../utils/media.js';
import {
  currentSubscription,
  mentionsName,
  notificationPermission,
  playNotificationSound,
  requestPermission,
  showSystemNotification,
  subscribePush,
  unsubscribePush,
} from '../utils/notify.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { createClientId } from '../utils/misc.js';
import { chatReducer, emptyThread, initialChatState } from './chatReducer.js';
import { createSocket, emitWithAck } from './socket.js';
import {
  buildContent,
  decryptLocationUpdate,
  decryptMessage,
  decryptPin,
  e2eeSession as e2eeSessionState,
  encryptAndSend,
  encryptUpload,
  endSession as endE2eeSession,
  onSessionChange as onE2eeSessionChange,
  forgetText,
  rememberLiveKey,
  sealFirstPosition,
  sealLivePosition,
  startSession as startE2eeSession,
} from '../e2ee/session.js';

// State and actions live in separate contexts: actions never change, so components
// that only call actions (composer, rows with buttons) don't re-render on chat events.
const ChatStateContext = createContext(null);
const ChatActionsContext = createContext(null);

const PAGE_SIZE = 30;
const DEFAULT_SETTINGS = { notificationsEnabled: true, messagePreview: true, soundEnabled: true, push: { available: false } };
const TYPING_SAFETY_MS = 8000; // drop a "typing…" we never got a stop for

/** Is this conversation on screen in a focused, visible tab? */
function isViewing(activeId, conversationId) {
  return activeId === conversationId && document.visibilityState === 'visible' && document.hasFocus();
}

/**
 * Owns the socket connection and the chat cache for the signed-in user.
 * Components read state with useChatState() and call actions from useChatActions().
 */
export function ChatProvider({ children }) {
  const { user, endSession, updateUser } = useAuth();
  // navigate() changes identity on every route change; a ref keeps callbacks (and the socket) stable.
  const navigateHook = useNavigate();
  const navigateRef = useRef(navigateHook);
  useEffect(() => {
    navigateRef.current = navigateHook;
  }, [navigateHook]);
  const navigate = useCallback((...args) => navigateRef.current(...args), []);
  const toast = useToast();
  const me = user.id;
  const [state, dispatch] = useReducer(chatReducer, { ...initialChatState, me });

  // Refs give socket callbacks and stable actions access to the latest state without re-subscribing.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const socketRef = useRef(null);
  // Extra socket listeners registered by other features (calls), event -> Set<handler>.
  const listenersRef = useRef(new Map());
  const activeIdRef = useRef(null);
  const typingTimers = useRef(new Map());
  const pendingFetches = useRef(new Map());

  // ---------- data loading ----------

  const loadConversations = useCallback(async () => {
    dispatch({ type: 'conversations/loading' });
    try {
      const { conversations } = await conversationsApi.list();
      dispatch({ type: 'conversations/loaded', conversations });
    } catch (error) {
      dispatch({ type: 'conversations/error', error: error.message });
    }
  }, []);

  const loadContacts = useCallback(async () => {
    dispatch({ type: 'contacts/loading' });
    try {
      const { contacts } = await contactsApi.list();
      dispatch({ type: 'contacts/loaded', contacts });
    } catch (error) {
      dispatch({ type: 'contacts/error', error: error.message });
    }
  }, []);

  /** Fetch one conversation (e.g. the first message of a chat someone else started). De-duplicated. */
  const fetchConversation = useCallback((id) => {
    if (!pendingFetches.current.has(id)) {
      const promise = conversationsApi
        .get(id)
        .then(({ conversation }) => {
          dispatch({ type: 'conversation/upsert', conversation });
          return conversation;
        })
        .finally(() => pendingFetches.current.delete(id));
      pendingFetches.current.set(id, promise);
    }
    return pendingFetches.current.get(id);
  }, []);

  const loadThread = useCallback(async (conversationId) => {
    dispatch({ type: 'thread/loading', conversationId });
    try {
      const { messages, hasMore } = await conversationsApi.messages(conversationId, { limit: PAGE_SIZE });
      dispatch({ type: 'thread/loaded', conversationId, messages, hasMore });
    } catch (error) {
      dispatch({ type: 'thread/error', conversationId, error: error.message });
    }
  }, []);

  const loadOlder = useCallback(async (conversationId) => {
    const thread = stateRef.current.threads[conversationId];
    const oldest = thread?.items.find((m) => m.id);
    if (!thread || thread.loadingOlder || !thread.hasMore || !oldest) return;
    dispatch({ type: 'thread/olderLoading', conversationId });
    try {
      const { messages, hasMore } = await conversationsApi.messages(conversationId, { before: oldest.id, limit: PAGE_SIZE });
      dispatch({ type: 'thread/olderLoaded', conversationId, messages, hasMore });
    } catch (error) {
      dispatch({ type: 'thread/olderError', conversationId, error: error.message });
    }
  }, []);

  /** After a reconnect: fetch everything newer than what each open thread already has. */
  const catchUpThreads = useCallback(async () => {
    const threads = Object.entries(stateRef.current.threads).filter(([, t]) => t.status === 'ready');
    await Promise.all(
      threads.map(async ([conversationId, thread]) => {
        let after = [...thread.items].reverse().find((m) => m.id)?.id;
        if (!after) return loadThread(Number(conversationId));
        try {
          // Page forward until we are current.
          for (;;) {
            const { messages } = await conversationsApi.messages(conversationId, { after, limit: 100 });
            if (messages.length > 0) dispatch({ type: 'thread/caughtUp', conversationId: Number(conversationId), messages });
            if (messages.length < 100) break;
            after = messages[messages.length - 1].id;
          }
        } catch {
          // The next reconnect or a manual reload will retry.
        }
      }),
    );
  }, [loadThread]);

  // ---------- receipts ----------

  /** Tell the server we've read everything in a conversation (socket, or REST when offline). */
  const markRead = useCallback(async (conversationId) => {
    const conversation = stateRef.current.conversations[conversationId];
    const thread = stateRef.current.threads[conversationId];
    const hasUnreadFromPeer =
      conversation?.unreadCount > 0 || thread?.items.some((m) => m.id && m.senderId !== me && m.status !== 'read');
    if (!hasUnreadFromPeer) return;
    dispatch({ type: 'conversation/markedRead', conversationId });
    const socket = socketRef.current;
    try {
      if (socket?.connected) await emitWithAck(socket, 'message:read', { conversationId });
      else await conversationsApi.markRead(conversationId);
    } catch {
      // Retried on the next focus / message.
    }
  }, [me]);

  // ---------- sending ----------

  // Live location manager (defined below); a ref so `deliver` can start tracking.
  const liveSharing = useRef({ start: () => {} });

  /** Send a payload over the socket, or over HTTP when the socket is down (the server broadcasts both). */
  const transmit = useCallback(async (payload) => {
    const socket = socketRef.current;
    if (socket?.connected) return (await emitWithAck(socket, 'message:send', payload)).message;
    const { conversationId, ...body } = payload;
    return (await conversationsApi.send(conversationId, body)).message;
  }, []);

  /** Who an encrypted message @mentions (the server can't read the text to find out). */
  const mentionedIds = useCallback(
    (conversationId, body) => {
      const members = stateRef.current.groups[conversationId]?.members ?? [];
      return members.filter((m) => m.id !== me && mentionsName(body, m.name)).map((m) => m.id);
    },
    [me],
  );

  /**
   * Send a message, end-to-end encrypted: text, sticker, location, the quoted
   * text and the keys of its files are encrypted on this device for every device
   * in the chat. The server only ever receives ciphertext.
   */
  const deliver = useCallback(async (message) => {
    const socket = socketRef.current;
    const { conversationId, clientId } = message;
    if (!socket?.connected && !navigator.onLine) return; // stays pending; resent on reconnect
    const replyToId = message.replyTo?.id ?? undefined;
    const attachmentIds = message.attachmentIds ?? [];
    const location = message.locationRequest; // { latitude, longitude, accuracy, liveMinutes? }
    const liveMinutes = location?.liveMinutes ?? null;
    try {
      const content = buildContent({
        body: message.body,
        sticker: message.sticker,
        location: liveMinutes ? null : location,
        liveMinutes,
        replyTo: message.replyTo,
        attachments: message.attachmentMeta ?? [],
      });
      const { result, messageKey } = await encryptAndSend(conversationId, content, async (encrypted, key) =>
        transmit({
          conversationId,
          clientId,
          replyToId,
          attachmentIds,
          encrypted,
          // A live location's positions are encrypted with the message's own key.
          encryptedLocation: liveMinutes ? { ...(await sealFirstPosition(key, location)), liveMinutes } : undefined,
          mentions: mentionedIds(conversationId, message.body),
        }),
      );
      if (liveMinutes && result.id) await rememberLiveKey(result.id, messageKey);
      const saved = await decryptMessage(result);
      dispatch({ type: 'message/received', message: saved, countUnread: false });
      releaseUpload(clientId);
      // A live location starts tracking once the server has it.
      if (saved.location?.active) liveSharing.current.start(saved);
    } catch (error) {
      // Timeouts/network errors stay retryable; validation errors are final.
      const retryable = !error.code || error.code === 'NETWORK_ERROR' || error.code === 'RATE_LIMITED';
      dispatch({
        type: 'message/failed',
        conversationId,
        clientId,
        error: retryable ? 'Not sent. Tap to retry.' : error.message,
      });
    }
  }, [transmit, mentionedIds]);

  /** An optimistic message shown right away, before the server has it. */
  const outgoing = useCallback(
    (conversationId, body, replyTo) => ({
      id: null,
      clientId: createClientId(),
      conversationId,
      senderId: me,
      body,
      createdAt: new Date().toISOString(),
      localCreatedAt: Date.now(),
      status: 'pending',
      deliveredAt: null,
      readAt: null,
      forwarded: false,
      editedAt: null,
      deletedAt: null,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            senderId: replyTo.senderId,
            body: replyTo.body,
            deleted: Boolean(replyTo.deletedAt),
            sticker: replyTo.sticker ?? null,
            attachmentKind: replyTo.attachments?.[0]?.kind ?? null,
          }
        : null,
      attachments: [],
      reactions: [],
      starred: false,
    }),
    [me],
  );

  /** `replyTo`: the message being answered (optional). */
  const sendMessage = useCallback(
    (conversationId, body, replyTo = null) => {
      const message = outgoing(conversationId, body, replyTo);
      dispatch({ type: 'message/pending', message });
      deliver(message);
    },
    [outgoing, deliver],
  );

  // ---------- attachments ----------
  // Files being uploaded per optimistic message: clientId -> { items, done: localId -> attachmentId, controller }.
  const uploadsRef = useRef(new Map());

  /** Forget a finished/cancelled upload and free its local previews (after the real ones have loaded). */
  function releaseUpload(clientId, { immediately = false } = {}) {
    const job = uploadsRef.current.get(clientId);
    if (!job) return;
    uploadsRef.current.delete(clientId);
    const revoke = () => {
      for (const item of job.items) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        if (item.posterUrl) URL.revokeObjectURL(item.posterUrl);
      }
    };
    if (immediately) revoke();
    else setTimeout(revoke, 60_000);
  }

  /** Upload whatever isn't uploaded yet (2 at a time), then send the message. */
  const runUploads = useCallback(
    async (message) => {
      const job = uploadsRef.current.get(message.clientId);
      if (!job) return;
      job.controller = new AbortController();
      const { conversationId, clientId } = message;
      const queue = job.items.filter((item) => !job.done.has(item.localId));

      const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          let lastSent = 0;
          // Prepared on the server (a GIPHY GIF it downloads, one of my stickers): nothing to upload.
          // Everything else is encrypted here first; its key goes into the (encrypted) message.
          let upload = item;
          if (!item.prepare) {
            const sealed = await encryptUpload(item.blob, item.thumbnail);
            upload = { ...item, blob: sealed.blob, thumbnail: sealed.thumbnail, encrypted: true };
            job.meta.set(item.localId, {
              key: sealed.key,
              iv: sealed.iv,
              tiv: sealed.tiv ?? undefined,
              name: item.name,
              mime: item.mimeType,
              size: item.size,
              w: item.width ?? undefined,
              h: item.height ?? undefined,
              dur: item.durationMs ?? undefined,
              pages: item.pageCount ?? undefined,
            });
          }
          const attachment = item.prepare ? await item.prepare() : await uploadAttachment(upload, {
            conversationId,
            signal: job.controller.signal,
            onProgress: (progress) => {
              // Throttle re-renders: only every 3%.
              if (progress - lastSent < 0.03 && progress < 1) return;
              lastSent = progress;
              dispatch({ type: 'message/uploadProgress', conversationId, clientId, localId: item.localId, progress });
            },
          });
          job.done.set(item.localId, attachment.id);
          dispatch({ type: 'message/uploadProgress', conversationId, clientId, localId: item.localId, progress: 1 });
        }
      };

      try {
        await Promise.all([worker(), worker()]);
      } catch (error) {
        if (error.name === 'AbortError') return; // cancelled by the user
        job.controller.abort(); // stop the other upload too
        const retryable = !error.code || error.code === 'NETWORK_ERROR' || error.code === 'RATE_LIMITED';
        dispatch({ type: 'message/failed', conversationId, clientId, error: retryable ? 'Upload failed. Tap to retry.' : error.message });
        return;
      }
      const attachmentIds = job.items.map((item) => job.done.get(item.localId));
      const attachmentMeta = job.items
        .filter((item) => job.meta.has(item.localId))
        .map((item) => ({ id: job.done.get(item.localId), ...job.meta.get(item.localId) }));
      dispatch({ type: 'message/uploaded', conversationId, clientId, attachmentIds, attachmentMeta });
      deliver({ ...message, attachmentIds, attachmentMeta });
    },
    [deliver],
  );

  /**
   * Send prepared files (see utils/media.js prepareFiles) with an optional caption.
   * The message appears immediately with local previews and upload progress.
   */
  const sendAttachments = useCallback(
    (conversationId, items, caption = '', replyTo = null) => {
      const message = {
        ...outgoing(conversationId, caption, replyTo),
        uploading: true,
        attachments: items.map((item) => ({
          localId: item.localId,
          local: true,
          kind: item.kind,
          name: item.name,
          size: item.size,
          mimeType: item.mimeType,
          width: item.width ?? null,
          height: item.height ?? null,
          durationMs: item.durationMs ?? null,
          previewUrl: item.previewUrl,
          posterUrl: item.posterUrl ?? null,
          progress: 0,
        })),
      };
      uploadsRef.current.set(message.clientId, { items, done: new Map(), meta: new Map(), controller: null });
      dispatch({ type: 'message/pending', message });
      runUploads(message);
    },
    [outgoing, runUploads],
  );

  /** A built-in sticker ("blob:love", "emoji:😂"): the whole message. */
  const sendSticker = useCallback(
    (conversationId, sticker, replyTo = null) => {
      const message = { ...outgoing(conversationId, '', replyTo), sticker };
      dispatch({ type: 'message/pending', message });
      deliver(message);
    },
    [outgoing, deliver],
  );

  /**
   * Send an attachment the server prepares (a GIF from GIPHY, a recent GIF, one of my
   * stickers). `preview`: { kind, mimeType, width, height, previewUrl } shown meanwhile;
   * `prepare()` resolves with the server's attachment. Retries re-run `prepare`.
   */
  const sendPrepared = useCallback(
    (conversationId, preview, prepare, replyTo = null, meta = null) => {
      const localId = createClientId();
      const message = {
        ...outgoing(conversationId, '', replyTo),
        uploading: true,
        attachments: [{ localId, local: true, name: preview.kind === 'sticker' ? 'Sticker' : 'GIF', size: 0, progress: 0, durationMs: null, ...preview }],
      };
      // `meta`: the file's key etc. when it's an encrypted file shared again (goes into the message).
      uploadsRef.current.set(message.clientId, { items: [{ localId, prepare }], done: new Map(), meta: new Map(meta ? [[localId, meta]] : []), controller: null });
      dispatch({ type: 'message/pending', message });
      runUploads(message);
    },
    [outgoing, runUploads],
  );

  const retryMessage = useCallback(
    (message) => {
      dispatch({ type: 'message/retrying', conversationId: message.conversationId, clientId: message.clientId });
      if (uploadsRef.current.has(message.clientId)) runUploads(message);
      else deliver(message);
    },
    [deliver, runUploads],
  );

  // Signing out / switching user: stop any uploads still running.
  useEffect(() => {
    const uploads = uploadsRef.current;
    return () => {
      for (const job of uploads.values()) job.controller?.abort();
      uploads.clear();
    };
  }, []);

  /** Remove an unsent message; cancels its uploads. */
  const discardMessage = useCallback((message) => {
    uploadsRef.current.get(message.clientId)?.controller?.abort();
    releaseUpload(message.clientId, { immediately: true });
    dispatch({ type: 'message/discard', conversationId: message.conversationId, clientId: message.clientId });
  }, []);

  /** Re-send everything still pending (clientId makes this idempotent server-side). */
  const flushPending = useCallback(() => {
    for (const thread of Object.values(stateRef.current.threads)) {
      for (const message of thread.items) {
        // Messages still uploading are sent by runUploads when their files are done.
        if (!message.id && message.status === 'pending' && !message.uploading) deliver(message);
      }
    }
  }, [deliver]);

  // ---------- location ----------
  // My live locations being tracked: messageId -> { watchId, expiryTimer, last, lastSentAt }.
  const liveWatches = useRef(new Map());

  /** Stop watching GPS for one live location (does not tell the server). */
  const stopTracking = useCallback((messageId) => {
    const watch = liveWatches.current.get(messageId);
    if (watch) {
      if (watch.watchId != null) navigator.geolocation.clearWatch(watch.watchId);
      clearTimeout(watch.expiryTimer);
      liveWatches.current.delete(messageId);
    }
    dispatch({ type: 'live/removed', messageId });
  }, []);

  /** Stop sharing a live location for everyone. */
  const stopLiveLocation = useCallback(
    async (messageId) => {
      stopTracking(messageId);
      const socket = socketRef.current;
      try {
        const result = socket?.connected
          ? await emitWithAck(socket, 'location:stop', { messageId })
          : await messagesApi.stopLiveLocation(messageId);
        dispatch({ type: 'location/updated', ...result });
      } catch {
        // It had already ended.
      }
    },
    [stopTracking],
  );

  const pushPosition = useCallback(
    async (messageId, coords) => {
      const socket = socketRef.current;
      try {
        // Encrypted live locations: the position is sealed with the message's own key.
        const position = (await sealLivePosition(messageId, coords)) ?? coords;
        if (socket?.connected) await emitWithAck(socket, 'location:update', { messageId, ...position });
        else await messagesApi.updateLocation(messageId, position);
      } catch (error) {
        // Ended, deleted, or no longer allowed (e.g. blocked): stop tracking. Other errors are transient.
        if (['LOCATION_NOT_LIVE', 'NOT_FOUND', 'FORBIDDEN', 'BLOCKED', 'CANNOT_MESSAGE'].includes(error.code)) stopTracking(messageId);
      }
    },
    [stopTracking],
  );

  /** Start sending my position for a live location message until it expires. */
  const startTracking = useCallback(
    ({ id: messageId, conversationId, location }) => {
      if (liveWatches.current.has(messageId)) return;
      const remaining = new Date(location.liveUntil).getTime() - Date.now();
      if (remaining <= 0) return;
      const watch = { watchId: null, last: null, lastSentAt: 0 };
      watch.expiryTimer = setTimeout(() => stopTracking(messageId), remaining);
      liveWatches.current.set(messageId, watch);
      dispatch({ type: 'live/added', messageId, share: { conversationId, liveUntil: location.liveUntil, tracking: canUseLocation() } });
      if (!canUseLocation()) return;

      watch.watchId = navigator.geolocation.watchPosition(
        (position) => {
          const coords = toCoords(position);
          const now = Date.now();
          // Only when moved meaningfully, and never faster than the server allows.
          if (watch.last && distanceMeters(watch.last, coords) < 15) return;
          if (now - watch.lastSentAt < 5000) return;
          watch.last = coords;
          watch.lastSentAt = now;
          pushPosition(messageId, coords);
        },
        (error) => {
          if (error.code === 1) stopLiveLocation(messageId); // permission revoked
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
      );
    },
    [pushPosition, stopTracking, stopLiveLocation],
  );

  useEffect(() => {
    liveSharing.current.start = startTracking;
  }, [startTracking]);

  /** After a reload: resume my running live locations (only if location access is already allowed). */
  const resumeLiveShares = useCallback(async () => {
    try {
      const { locations } = await messagesApi.liveLocations();
      if (locations.length === 0) return;
      const permission = await locationPermission();
      for (const share of locations) {
        if (permission === 'granted') {
          startTracking({ id: share.messageId, conversationId: share.conversationId, location: { liveUntil: share.liveUntil } });
        } else {
          // Can't track without asking; still list it so it can be stopped.
          dispatch({ type: 'live/added', messageId: share.messageId, share: { conversationId: share.conversationId, liveUntil: share.liveUntil, tracking: false } });
        }
      }
    } catch {
      // Not critical; the shares simply expire on their own.
    }
  }, [startTracking]);

  /** Restart tracking for live shares that were paused by a reload (asks for location permission). */
  const resumeLiveSharing = useCallback(() => {
    for (const [messageId, share] of Object.entries(stateRef.current.myLiveShares)) {
      if (!share.tracking) startTracking({ id: Number(messageId), conversationId: share.conversationId, location: { liveUntil: share.liveUntil } });
    }
  }, [startTracking]);

  /** Share a location: `liveMinutes` (15 / 60 / 480) makes it live. */
  const sendLocation = useCallback(
    (conversationId, coords, { liveMinutes, replyTo = null } = {}) => {
      const message = {
        ...outgoing(conversationId, '', replyTo),
        locationRequest: { ...coords, ...(liveMinutes ? { liveMinutes } : {}) },
        location: {
          ...coords,
          live: Boolean(liveMinutes),
          active: Boolean(liveMinutes),
          liveUntil: liveMinutes ? new Date(Date.now() + liveMinutes * 60_000).toISOString() : null,
          stoppedAt: null,
        },
      };
      dispatch({ type: 'message/pending', message });
      deliver(message);
    },
    [outgoing, deliver],
  );

  // Signing out: stop all GPS watches.
  useEffect(() => {
    const watches = liveWatches.current;
    return () => {
      for (const watch of watches.values()) {
        if (watch.watchId != null) navigator.geolocation.clearWatch(watch.watchId);
        clearTimeout(watch.expiryTimer);
      }
      watches.clear();
    };
  }, []);

  // ---------- notifications & settings ----------

  /**
   * Alert me about an incoming message, unless I'm already reading that chat:
   * a system notification when the tab is in the background, otherwise a
   * clickable in-app notice. Muted chats stay quiet unless I'm @mentioned.
   */
  const notifyIncoming = useRef(() => {});
  useEffect(() => {
    notifyIncoming.current = (message) => {
      const s = stateRef.current;
      const settings = s.settings ?? DEFAULT_SETTINGS;
      if (!settings.notificationsEnabled) return;
      const conversation = s.conversations[message.conversationId];
      const mentioned = mentionsName(message.body, user.name);
      const muted = conversation?.mutedUntil && new Date(conversation.mutedUntil) > new Date();
      if (muted && !mentioned) return;
      const hidden = document.visibilityState === 'hidden' || !document.hasFocus();
      if (!hidden && activeIdRef.current === message.conversationId) return; // already reading it

      const group = isGroup(conversation);
      const sender = message.senderName ?? conversation?.peer?.name ?? 'Someone';
      const name = conversation ? chatTitle(conversation) : 'New message';
      const title = mentioned ? `${sender} mentioned you${group ? ` in ${name}` : ''}` : name;
      const text = settings.messagePreview ? messagePreview(message) : 'New message';
      const body = group && !mentioned ? `${sender}: ${text}` : text;
      const url = `/c/${message.conversationId}`;
      if (settings.soundEnabled) playNotificationSound();
      if (hidden) {
        showSystemNotification({ title, body, tag: `conversation-${message.conversationId}`, url });
      } else {
        toast.notice({ title, body, avatar: conversation && <Avatar user={chatAvatar(conversation)} size="sm" />, onClick: () => navigate(url) });
      }
    };
  });

  const loadSettings = useCallback(async () => {
    try {
      const [{ settings }, { unread }] = await Promise.all([settingsApi.get(), notificationsApi.list()]);
      dispatch({ type: 'settings/loaded', settings });
      dispatch({ type: 'notifications/unread', count: unread });
      // This browser may already be subscribed (e.g. before a re-login): tie it to the current session.
      if (settings.push.available && notificationPermission() === 'granted') {
        const subscription = await currentSubscription();
        if (subscription) await settingsApi.subscribePush(subscription.toJSON());
      }
    } catch {
      // Defaults apply until the next load.
    }
  }, []);

  // The account's appearance wins once loaded (and follows changes from other tabs).
  const appearance = state.settings?.appearance;
  useEffect(() => {
    if (appearance) applyAppearance(appearance);
  }, [appearance]);

  /** Change appearance; applied instantly, then saved (reverted if saving fails). */
  const updateAppearance = useCallback(async (fields) => {
    const previous = stateRef.current.settings;
    if (previous) dispatch({ type: 'settings/loaded', settings: { ...previous, appearance: { ...previous.appearance, ...fields } } });
    try {
      const { settings } = await settingsApi.update({ appearance: fields });
      dispatch({ type: 'settings/loaded', settings });
    } catch (error) {
      if (previous) dispatch({ type: 'settings/loaded', settings: previous });
      throw error;
    }
  }, []);

  const withAbsoluteUrl = (wallpaper) => ({ ...wallpaper, absoluteUrl: assetUrl(wallpaper.url) });

  const loadWallpapers = useCallback(async () => {
    try {
      const { wallpapers } = await appearanceApi.wallpapers();
      dispatch({ type: 'wallpapers/loaded', wallpapers: wallpapers.map(withAbsoluteUrl) });
    } catch {
      // Custom wallpapers just won't show until the next load.
    }
  }, []);

  const uploadWallpaper = useCallback(async (blob) => {
    const { wallpaper } = await appearanceApi.uploadWallpaper(blob);
    const added = withAbsoluteUrl(wallpaper);
    dispatch({ type: 'wallpapers/loaded', wallpapers: [added, ...stateRef.current.wallpapers] });
    return added;
  }, []);

  const deleteWallpaper = useCallback(async (id) => {
    await appearanceApi.deleteWallpaper(id);
    dispatch({ type: 'wallpapers/loaded', wallpapers: stateRef.current.wallpapers.filter((w) => w.id !== id) });
    // Chats that used it fall back to the default.
    for (const conversation of Object.values(stateRef.current.conversations)) {
      if (conversation.wallpaper === `custom:${id}`) dispatch({ type: 'conversation/wallpaper', conversationId: conversation.id, wallpaper: null });
    }
  }, []);

  /** My wallpaper for one chat; null = use my default. */
  // ---------- groups ----------
  const leavingRef = useRef(new Set()); // groups I'm leaving myself (no "you were removed" notice)

  const loadGroupInfo = useCallback(async (conversationId) => {
    try {
      const { group } = await groupsApi.get(conversationId);
      dispatch({ type: 'group/info', conversationId, info: group });
      return group;
    } catch {
      return null;
    }
  }, []);

  /** Run a group change; the response is the new group info (the server also tells every member). */
  const groupChange = useCallback(
    async (conversationId, request) => {
      const { group } = await request();
      dispatch({ type: 'group/info', conversationId, info: group });
      fetchConversation(conversationId).catch(() => {});
      return group;
    },
    [fetchConversation],
  );

  const createGroup = useCallback(async ({ name, description, memberIds }) => {
    const { conversation } = await groupsApi.create({ name, description, memberIds });
    dispatch({ type: 'conversation/upsert', conversation });
    socketRef.current?.emit('conversation:join', { conversationId: conversation.id });
    return conversation;
  }, []);

  const updateGroup = useCallback((id, fields) => groupChange(id, () => groupsApi.update(id, fields)), [groupChange]);
  const setGroupAvatar = useCallback((id, blob) => groupChange(id, () => groupsApi.setAvatar(id, blob)), [groupChange]);
  const removeGroupAvatar = useCallback((id) => groupChange(id, () => groupsApi.removeAvatar(id)), [groupChange]);
  const addGroupMembers = useCallback((id, userIds) => groupChange(id, () => groupsApi.addMembers(id, userIds)), [groupChange]);
  const removeGroupMember = useCallback((id, userId) => groupChange(id, () => groupsApi.removeMember(id, userId)), [groupChange]);
  const setGroupRole = useCallback((id, userId, role) => groupChange(id, () => groupsApi.setRole(id, userId, role)), [groupChange]);

  const leaveGroup = useCallback(
    async (conversationId) => {
      leavingRef.current.add(conversationId);
      await groupsApi.leave(conversationId);
      dispatch({ type: 'conversation/removed', conversationId });
      navigate('/');
    },
    [navigate],
  );

  const setGroupInvite = useCallback(async (conversationId, enabled) => {
    const { inviteCode } = enabled ? await groupsApi.createInvite(conversationId) : await groupsApi.revokeInvite(conversationId);
    const info = stateRef.current.groups[conversationId];
    if (info) dispatch({ type: 'group/info', conversationId, info: { ...info, inviteCode } });
    return inviteCode;
  }, []);

  const joinGroup = useCallback(async (code) => {
    const { conversation } = await groupsApi.join(code);
    dispatch({ type: 'conversation/upsert', conversation });
    socketRef.current?.emit('conversation:join', { conversationId: conversation.id });
    return conversation;
  }, []);

  const setChatWallpaper = useCallback(async (conversationId, wallpaper) => {
    const result = await appearanceApi.setChatWallpaper(conversationId, wallpaper);
    dispatch({ type: 'conversation/wallpaper', ...result });
  }, []);

  const updateSettings = useCallback(async (fields) => {
    const { settings } = await settingsApi.update(fields);
    dispatch({ type: 'settings/loaded', settings });
  }, []);

  /** duration: '8h' | '1w' | 'always'; null unmutes. */
  const muteConversation = useCallback(async (conversationId, duration) => {
    const result = duration ? await conversationsApi.mute(conversationId, duration) : await conversationsApi.unmute(conversationId);
    dispatch({ type: 'conversation/muted', ...result });
  }, []);

  /** Turn on notifications for this browser (asks permission; subscribes to push when the server supports it). */
  const enableDeviceNotifications = useCallback(async () => {
    const permission = await requestPermission();
    if (permission === 'unsupported') throw new Error('This browser does not support notifications.');
    if (permission !== 'granted') {
      throw new Error('Notifications are blocked for this site. Allow them in your browser settings (the 🔒 icon in the address bar).');
    }
    const push = stateRef.current.settings?.push;
    if (push?.available) await settingsApi.subscribePush(await subscribePush(push.publicKey));
  }, []);

  const disableDeviceNotifications = useCallback(async () => {
    const endpoint = await unsubscribePush();
    if (endpoint) await settingsApi.unsubscribePush(endpoint);
  }, []);

  const markNotificationsRead = useCallback(async (ids) => {
    const { unread } = await notificationsApi.markRead(ids);
    dispatch({ type: 'notifications/unread', count: unread });
  }, []);

  // Clicking a notification focuses this tab; the service worker tells us which chat to open.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type === 'temu:navigate' && typeof event.data.url === 'string' && event.data.url.startsWith('/')) {
        navigate(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  // Unread count in the browser tab title: "(3) Vestige Chat".
  const totalUnread = Object.values(state.conversations).reduce((sum, c) => sum + c.unreadCount, 0);
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? '99+' : totalUnread}) Vestige Chat` : 'Vestige Chat';
    return () => {
      document.title = 'Vestige Chat';
    };
  }, [totalUnread]);

  // ---------- typing ----------

  /** activity: 'typing' or 'recording' (voice message). */
  const setTyping = useCallback((conversationId, isTyping, activity = 'typing') => {
    const socket = socketRef.current;
    if (socket?.connected) socket.emit(isTyping ? 'typing:start' : 'typing:stop', { conversationId, activity });
  }, []);

  // ---------- contacts & conversations ----------

  const addContact = useCallback(async (userId) => {
    const { contact } = await contactsApi.add(userId);
    dispatch({ type: 'contacts/added', contact });
    return contact;
  }, []);

  const removeContact = useCallback(async (userId) => {
    await contactsApi.remove(userId);
    dispatch({ type: 'contacts/removed', userId });
  }, []);

  // ---------- message actions (server broadcasts; we also apply results right away) ----------

  const editMessage = useCallback(async (message, body) => {
    if (!message.content) {
      const { message: updated } = await messagesApi.edit(message.id, { body });
      dispatch({ type: 'message/updated', message: updated });
      return;
    }
    // Encrypted: re-encrypt the new text (files and quote stay as they were).
    const { result } = await encryptAndSend(message.conversationId, { ...message.content, t: body }, (encrypted) =>
      messagesApi.edit(message.id, { encrypted }).then((r) => r.message),
    );
    dispatch({ type: 'message/updated', message: await decryptMessage(result) });
  }, []);

  /** scope: 'me' | 'everyone' */
  const deleteMessage = useCallback(
    async (message, scope) => {
      if (scope === 'everyone') {
        const { message: updated } = await messagesApi.remove(message.id, 'everyone');
        dispatch({ type: 'message/updated', message: updated });
      } else {
        await messagesApi.remove(message.id, 'me');
        dispatch({ type: 'message/hidden', conversationId: message.conversationId, messageId: message.id });
        if (!stateRef.current.conversations[message.conversationId]?.lastMessage) fetchConversation(message.conversationId);
      }
    },
    [fetchConversation],
  );

  /** Toggle: reacting with your current emoji removes it. */
  const reactToMessage = useCallback(
    async (message, emoji) => {
      const mine = message.reactions?.find((r) => r.userId === me)?.emoji;
      const result = mine === emoji ? await messagesApi.unreact(message.id) : await messagesApi.react(message.id, emoji);
      dispatch({ type: 'message/reactions', ...result });
    },
    [me],
  );

  const toggleStar = useCallback(async (message) => {
    const result = message.starred ? await messagesApi.unstar(message.id) : await messagesApi.star(message.id);
    dispatch({ type: 'message/starred', ...result });
  }, []);

  const loadPins = useCallback(async (conversationId) => {
    try {
      const { pins } = await conversationsApi.pins(conversationId);
      dispatch({ type: 'pins/loaded', conversationId, pins });
    } catch {
      // Pins are optional UI; the next open retries.
    }
  }, []);

  const togglePin = useCallback(async (message) => {
    const pinned = stateRef.current.pins[message.conversationId]?.some((p) => p.messageId === message.id);
    const { conversationId, pins } = pinned ? await messagesApi.unpin(message.id) : await messagesApi.pin(message.id);
    dispatch({ type: 'pins/loaded', conversationId, pins });
  }, []);

  const forwardMessage = useCallback(
    async (message, conversationIds) => {
      if (!message.content) {
        const { messages } = await messagesApi.forward(message.id, conversationIds);
        for (const saved of messages) dispatch({ type: 'message/received', message: saved, countUnread: false });
        return;
      }
      // Encrypted: this device re-encrypts the content for each chat; the server shares the files.
      // A live location is forwarded as a still pin at its last position.
      const { q: _quote, live: _live, ...content } = message.content;
      if (message.location?.latitude != null) content.loc = { latitude: message.location.latitude, longitude: message.location.longitude, accuracy: message.location.accuracy ?? null };
      for (const conversationId of new Set(conversationIds)) {
        const { result } = await encryptAndSend(conversationId, content, (encrypted) =>
          transmit({ conversationId, clientId: createClientId(), encrypted, forwardFrom: message.id, mentions: [] }),
        );
        dispatch({ type: 'message/received', message: await decryptMessage(result), countUnread: false });
      }
    },
    [transmit],
  );

  /** Load older pages until `messageId` is in the thread (for jumping to replies, pins, search results). */
  const loadUntil = useCallback(async (conversationId, messageId) => {
    for (let page = 0; page < 50; page += 1) {
      const thread = stateRef.current.threads[conversationId];
      if (!thread || thread.status !== 'ready' || (thread.error && !thread.loadingOlder)) return false;
      if (thread.items.some((m) => m.id === messageId)) return true;
      const oldest = thread.items.find((m) => m.id);
      if (!thread.hasMore || (oldest && oldest.id < messageId)) return false;
      await loadOlder(conversationId);
      // Let React commit the new page (stateRef updates after commit) before looking again.
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return false;
  }, [loadOlder]);

  const blockUser = useCallback(async (userId) => {
    await blocksApi.block(userId);
    dispatch({ type: 'block/updated', userId, blocked: true });
  }, []);

  const unblockUser = useCallback(async (userId) => {
    await blocksApi.unblock(userId);
    dispatch({ type: 'block/updated', userId, blocked: false });
  }, []);

  const openConversation = useCallback(async (userId) => {
    const { conversation } = await conversationsApi.open(userId);
    dispatch({ type: 'conversation/upsert', conversation });
    socketRef.current?.emit('conversation:join', { conversationId: conversation.id });
    return conversation;
  }, []);

  const setActiveConversation = useCallback((conversationId) => {
    activeIdRef.current = conversationId;
  }, []);

  /** Listen to a server event (works before the socket exists). Returns an unsubscribe function. */
  const subscribe = useCallback((event, handler) => {
    const map = listenersRef.current;
    if (!map.has(event)) map.set(event, new Set());
    map.get(event).add(handler);
    return () => map.get(event)?.delete(handler);
  }, []);

  /** emit + ack over the chat socket; rejects while offline. */
  const emitSocket = useCallback((event, payload) => {
    const socket = socketRef.current;
    if (!socket?.connected) return Promise.reject(new Error("You're offline. Check your connection and try again."));
    return emitWithAck(socket, event, payload);
  }, []);

  // ---------- socket lifecycle ----------

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    let hadSession = false;
    let closed = false;

    const clearTypingTimer = (key) => {
      clearTimeout(typingTimers.current.get(key));
      typingTimers.current.delete(key);
    };

    /** Refresh the access token, then reconnect; log out if the session is gone. */
    const reauthenticate = async () => {
      try {
        const session = await refreshSession();
        if (!session) return endSession();
        if (!closed) socket.connect();
      } catch {
        // Server unreachable: try again shortly.
        if (!closed) setTimeout(() => !closed && !socket.connected && reauthenticate(), 3000);
      }
    };

    socket.on('connect', () => dispatch({ type: 'connection', status: 'connected' }));
    socket.onAny((event, payload) => {
      for (const handler of listenersRef.current.get(event) ?? []) handler(payload);
    });

    socket.on('session:ready', () => {
      dispatch({ type: 'connection', status: 'connected' });
      // Encryption setup failed earlier (e.g. server unreachable): try again now that we're connected.
      if (['error', 'idle'].includes(e2eeSessionState().status)) startE2eeSession(me);
      if (hadSession) {
        // Reconnected: re-sync everything the socket may have missed.
        loadConversations();
        loadContacts();
        catchUpThreads().then(() => {
          flushPending();
          if (isViewing(activeIdRef.current, activeIdRef.current)) markRead(activeIdRef.current);
        });
      } else {
        flushPending();
      }
      hadSession = true;
    });

    socket.on('disconnect', (reason) => {
      dispatch({ type: 'typing/clearAll' });
      if (closed) return;
      dispatch({ type: 'connection', status: 'reconnecting' });
      // Server-initiated disconnects (token expiry) are not retried automatically.
      if (reason === 'io server disconnect') reauthenticate();
    });

    socket.on('connect_error', (error) => {
      dispatch({ type: 'connection', status: navigator.onLine ? 'reconnecting' : 'offline' });
      // Middleware rejections stop automatic reconnection; refresh the token and try again.
      if (!socket.active && ['TOKEN_EXPIRED', 'UNAUTHORIZED'].includes(error.data?.code)) reauthenticate();
    });

    socket.on('auth:expired', () => {
      // The server disconnects right after; 'disconnect' triggers reauthentication.
    });

    socket.on('auth:revoked', () => {
      closed = true;
      socket.disconnect();
      endSession();
    });

    socket.on('message:new', async (incoming) => {
      const message = await decryptMessage(incoming);
      const fromPeer = message.senderId !== me;
      // A conversation fetched now was loaded after this message was saved, so its
      // unreadCount already includes it; counting again would double it.
      let alreadyCounted = false;
      if (!stateRef.current.conversations[message.conversationId]) {
        try {
          await fetchConversation(message.conversationId);
          alreadyCounted = true;
        } catch {
          return;
        }
      }
      const viewing = fromPeer && isViewing(activeIdRef.current, message.conversationId);
      // System notes don't count as unread (like on the server), except calls I missed.
      const counts = !message.event || (message.event.type === 'call' && isMissedCall(message.event.data, me));
      dispatch({ type: 'message/received', message, countUnread: fromPeer && !viewing && !alreadyCounted && counts });
      if (fromPeer && !message.event) notifyIncoming.current(message); // system messages stay quiet
      if (!fromPeer) return;
      if (viewing) {
        emitWithAck(socket, 'message:read', { conversationId: message.conversationId, messageId: message.id }).catch(() => {});
      } else {
        emitWithAck(socket, 'message:delivered', { conversationId: message.conversationId, messageId: message.id }).catch(() => {});
      }
    });

    socket.on('message:status', (receipt) => dispatch({ type: 'message/receipt', receipt }));
    socket.on('message:updated', async (incoming) => {
      const message = await decryptMessage(incoming);
      if (message.deletedAt) forgetText(message.id); // erased for everyone: drop it from on-device search
      dispatch({ type: 'message/updated', message });
    });
    socket.on('message:hidden', ({ conversationId, messageId }) => dispatch({ type: 'message/hidden', conversationId, messageId }));
    socket.on('message:reactions', (result) => dispatch({ type: 'message/reactions', ...result }));
    socket.on('message:starred', (result) => dispatch({ type: 'message/starred', ...result }));
    socket.on('conversation:pins', async ({ conversationId, pins }) => {
      dispatch({ type: 'pins/loaded', conversationId, pins: await Promise.all(pins.map(decryptPin)) });
    });
    socket.on('settings:updated', (settings) => dispatch({ type: 'settings/loaded', settings }));
    socket.on('conversation:wallpaper', (result) => dispatch({ type: 'conversation/wallpaper', ...result }));
    // Name, photo, members, roles or permissions changed: refresh what we show.
    socket.on('group:updated', ({ conversationId }) => {
      fetchConversation(conversationId).catch(() => {});
      if (stateRef.current.groups[conversationId]) loadGroupInfo(conversationId);
    });
    socket.on('group:removed', ({ conversationId, deleted }) => {
      const name = chatTitle(stateRef.current.conversations[conversationId]);
      dispatch({ type: 'conversation/removed', conversationId });
      if (activeIdRef.current === conversationId) navigate('/');
      if (!deleted && !leavingRef.current.has(conversationId)) toast.show(`You were removed from ${name || 'a group'}`);
      leavingRef.current.delete(conversationId);
    });
    // The other person deleted their account: our one-to-one chat is gone.
    socket.on('conversation:removed', ({ conversationId }) => {
      if (!stateRef.current.conversations[conversationId]) return;
      dispatch({ type: 'conversation/removed', conversationId });
      if (activeIdRef.current === conversationId) navigate('/');
      toast.show('This chat was deleted because the other person deleted their account');
    });
    // Someone I know deleted their account: refresh lists that may still show them.
    socket.on('user:deleted', () => {
      loadConversations();
      loadContacts();
    });
    socket.on('conversation:muted', (result) => dispatch({ type: 'conversation/muted', ...result }));
    socket.on('notifications:read', ({ unread }) => dispatch({ type: 'notifications/unread', count: unread }));
    socket.on('notification:new', (notification) => {
      dispatch({ type: 'notifications/increment' });
      // Mentions were already announced with their message.
      if (notification.type === 'contact_added') {
        toast.notice({
          title: notification.actor.name,
          body: 'added you as a contact',
          avatar: <Avatar user={notification.actor} size="sm" />,
        });
      }
    });
    socket.on('location:updated', async (incoming) => {
      const { conversationId, messageId, location } = await decryptLocationUpdate(incoming);
      dispatch({ type: 'location/updated', conversationId, messageId, location });
      // Stopped in another tab, or expired: stop tracking here too.
      if (!location.active) stopTracking(messageId);
    });

    socket.on('typing', ({ conversationId, userId, isTyping, activity }) => {
      if (userId === me) return;
      const key = `${conversationId}:${userId}`;
      clearTypingTimer(key);
      dispatch({ type: 'typing', conversationId, userId, isTyping, activity });
      if (isTyping) {
        typingTimers.current.set(
          key,
          setTimeout(() => dispatch({ type: 'typing', conversationId, userId, isTyping: false }), TYPING_SAFETY_MS),
        );
      }
    });

    socket.on('presence:update', ({ userId, isOnline, lastSeenAt }) => dispatch({ type: 'presence', userId, isOnline, lastSeenAt }));

    // Someone I know changed their name/photo/about/status (or I was blocked and they are now hidden).
    socket.on('user:updated', (profile) => dispatch({ type: 'user/updated', user: profile }));
    // I changed my profile in another tab.
    socket.on('profile:updated', (profile) => updateUser(profile));
    // I blocked/unblocked someone in another tab.
    socket.on('block:updated', ({ userId, blocked }) => dispatch({ type: 'block/updated', userId, blocked }));

    const goOnline = () => {
      if (!socket.connected) socket.connect();
    };
    const goOffline = () => dispatch({ type: 'connection', status: 'offline' });
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Keys first, so the very first messages loaded can already be decrypted (but never wait
    // forever: if setup is slow, load now and reload what's open once it's ready).
    const setup = startE2eeSession(me);
    // Encryption became ready after the app had already loaded: decrypt what's on screen.
    const stopWatching = onE2eeSessionChange((current) => {
      if (closed || current.status !== 'ready') return;
      const s = stateRef.current;
      const notReady = (m) => m?.undecryptable === 'not-ready';
      const pendingThreads = Object.entries(s.threads).filter(([, t]) => t.items.some(notReady));
      if (pendingThreads.length || Object.values(s.conversations).some((c) => notReady(c.lastMessage))) loadConversations();
      for (const [conversationId] of pendingThreads) loadThread(Number(conversationId));
    });
    Promise.race([setup, new Promise((resolve) => setTimeout(resolve, 6000))]).finally(() => {
      if (closed) return;
      socket.connect();
      loadConversations();
      loadContacts();
      resumeLiveShares();
      loadSettings();
      loadWallpapers();
    });

    const timers = typingTimers.current;
    return () => {
      closed = true;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      socket.removeAllListeners();
      socket.disconnect();
      stopWatching();
      endE2eeSession();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      socketRef.current = null;
    };
    // `me` identifies the session; the callbacks below are stable.
  }, [me, endSession, updateUser, loadThread, loadConversations, loadContacts, catchUpThreads, flushPending, fetchConversation, markRead, stopTracking, resumeLiveShares, loadSettings, loadWallpapers, loadGroupInfo, navigate, toast]);

  // Every callback above is stable, so this object is created once per session.
  const actions = useMemo(
    () => ({
      me,
      loadConversations,
      loadContacts,
      loadThread,
      loadOlder,
      fetchConversation,
      sendMessage,
      sendSticker,
      sendPrepared,
      sendAttachments,
      sendLocation,
      stopLiveLocation,
      resumeLiveSharing,
      updateSettings,
      updateAppearance,
      uploadWallpaper,
      deleteWallpaper,
      setChatWallpaper,
      loadGroupInfo,
      createGroup,
      updateGroup,
      setGroupAvatar,
      removeGroupAvatar,
      addGroupMembers,
      removeGroupMember,
      setGroupRole,
      leaveGroup,
      setGroupInvite,
      joinGroup,
      muteConversation,
      enableDeviceNotifications,
      disableDeviceNotifications,
      markNotificationsRead,
      retryMessage,
      discardMessage,
      markRead,
      setTyping,
      addContact,
      removeContact,
      blockUser,
      unblockUser,
      openConversation,
      setActiveConversation,
      editMessage,
      deleteMessage,
      reactToMessage,
      toggleStar,
      loadPins,
      togglePin,
      forwardMessage,
      loadUntil,
      subscribe,
      emitSocket,
    }),
    [
      me,
      loadConversations,
      loadContacts,
      loadThread,
      loadOlder,
      fetchConversation,
      sendMessage,
      sendSticker,
      sendPrepared,
      sendAttachments,
      sendLocation,
      stopLiveLocation,
      resumeLiveSharing,
      updateSettings,
      updateAppearance,
      uploadWallpaper,
      deleteWallpaper,
      setChatWallpaper,
      loadGroupInfo,
      createGroup,
      updateGroup,
      setGroupAvatar,
      removeGroupAvatar,
      addGroupMembers,
      removeGroupMember,
      setGroupRole,
      leaveGroup,
      setGroupInvite,
      joinGroup,
      muteConversation,
      enableDeviceNotifications,
      disableDeviceNotifications,
      markNotificationsRead,
      retryMessage,
      discardMessage,
      markRead,
      setTyping,
      addContact,
      removeContact,
      blockUser,
      unblockUser,
      openConversation,
      setActiveConversation,
      editMessage,
      deleteMessage,
      reactToMessage,
      toggleStar,
      loadPins,
      togglePin,
      forwardMessage,
      loadUntil,
      subscribe,
      emitSocket,
    ],
  );

  return (
    <ChatActionsContext.Provider value={actions}>
      <ChatStateContext.Provider value={state}>{children}</ChatStateContext.Provider>
    </ChatActionsContext.Provider>
  );
}

/** Chat cache; components using it re-render on every chat update. */
export function useChatState() {
  const state = useContext(ChatStateContext);
  if (!state) throw new Error('useChatState must be used inside <ChatProvider>');
  return state;
}

/** Stable actions (plus `me`); never triggers a re-render by itself. */
export function useChatActions() {
  const actions = useContext(ChatActionsContext);
  if (!actions) throw new Error('useChatActions must be used inside <ChatProvider>');
  return actions;
}

export function useThread(conversationId) {
  return useChatState().threads[conversationId] ?? emptyThread;
}
