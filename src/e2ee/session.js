import { http } from '../api/client.js';
import {
  cryptoAvailable,
  decryptBytes,
  decryptContent,
  encryptBytes,
  encryptContent,
  exportPublicKey,
  generateDeviceKeys,
  openWithMessageKey,
  sealWithMessageKey,
  securityCode,
} from './crypto.js';
import { deviceStore } from './device.js';
import { keystore } from './keystore.js';

/**
 * End-to-end encryption on this device: setting up its keys, encrypting what we
 * send, decrypting what we receive, and the files that go with it.
 *
 * status: 'idle' | 'starting' | 'ready' | 'unavailable' (no Web Crypto: not HTTPS) | 'error'
 */
let session = { status: 'idle', userId: null, deviceId: null, privateKey: null, publicKey: null };
const listeners = new Set();

export const e2eeSession = () => session;
export function onSessionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function update(next) {
  session = next;
  for (const listener of listeners) listener(session);
}

function deviceName() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown';
  return `${browser} on ${os}`;
}

/**
 * Make sure this browser has keys for this account and that the server knows the
 * public one. Keys are reused across sign-ins on the same browser, so history
 * stays readable; clearing the browser's site data starts a new device.
 */
let starting = null; // { userId, promise }: one setup at a time per account
let retryTimer = null;
let retryDelay = 2000;

export function startSession(userId) {
  if (session.status === 'ready' && session.userId === userId) return Promise.resolve(session);
  // Two callers at once (e.g. React running effects twice in development) must share one
  // setup, or the same browser would register two devices.
  if (starting?.userId === userId) return starting.promise;
  clearTimeout(retryTimer);
  const promise = setUp(userId).finally(() => {
    if (starting?.promise === promise) starting = null;
    // Failed (server unreachable, browser storage busy right after a reload…): try again
    // by itself, waiting a little longer each time.
    if (session.status === 'error' && session.userId === userId) {
      retryTimer = setTimeout(() => startSession(userId), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    } else if (session.status === 'ready') {
      retryDelay = 2000;
    }
  });
  starting = { userId, promise };
  return promise;
}

async function setUp(userId) {
  if (!cryptoAvailable() || !keystore.available()) {
    update({ status: 'unavailable', userId, deviceId: null, privateKey: null, publicKey: null });
    return session;
  }
  update({ ...session, status: 'starting', userId });
  try {
    let record = await keystore.getDevice(userId);
    if (!record) {
      const keyPair = await generateDeviceKeys();
      record = { userId, keyPair, publicKey: await exportPublicKey(keyPair.publicKey), deviceId: null };
      await keystore.saveDevice(record);
    }
    let device;
    try {
      ({ device } = await http.post('/e2ee/devices', { publicKey: record.publicKey, name: deviceName() }));
    } catch (error) {
      // This device was removed in "Linked devices": start over with new keys.
      if (error.code === 'DEVICE_REVOKED') {
        await keystore.deleteDevice(userId);
        update({ ...session, status: 'idle' });
        return setUp(userId);
      }
      throw error;
    }
    await keystore.saveDevice({ ...record, deviceId: device.id });
    deviceStore.set(device.id);
    update({ status: 'ready', userId, deviceId: device.id, privateKey: record.keyPair.privateKey, publicKey: record.publicKey });
  } catch (error) {
    update({ status: 'error', userId, deviceId: null, privateKey: null, publicKey: null, error });
  }
  return session;
}

export function endSession() {
  clearTimeout(retryTimer);
  retryDelay = 2000;
  deviceStore.set(null);
  deviceCache.clear();
  messageKeys.clear();
  for (const entry of fileCache.values()) entry.then((url) => url && URL.revokeObjectURL(url)).catch(() => {});
  fileCache.clear();
  fileKeys.clear();
  update({ status: 'idle', userId: null, deviceId: null, privateKey: null, publicKey: null });
}

const me = () => ({ userId: session.userId, deviceId: session.deviceId, privateKey: session.privateKey });

/** Can this device send encrypted messages right now? Throws a readable error if not. */
export function assertReady() {
  if (session.status === 'ready') return;
  if (session.status === 'unavailable') {
    throw Object.assign(new Error('Encrypted messaging needs a secure connection. Open Vestige Chat over HTTPS (or on localhost).'), { code: 'E2EE_UNAVAILABLE' });
  }
  // Still starting, or the server was unreachable: worth retrying.
  throw new Error('Encryption is still being set up on this device. Try again in a moment.');
}

// ---------- who to encrypt for ----------

const deviceCache = new Map(); // conversationId -> { devices, at }
const DEVICE_TTL_MS = 60_000;

async function devicesFor(conversationId, { fresh = false } = {}) {
  const cached = deviceCache.get(conversationId);
  if (!fresh && cached && Date.now() - cached.at < DEVICE_TTL_MS) return cached.devices;
  const { devices } = await http.get(`/e2ee/conversations/${encodeURIComponent(conversationId)}/devices`);
  deviceCache.set(conversationId, { devices, at: Date.now() });
  return devices;
}

/**
 * Encrypt `content` for everyone's devices in the chat and hand the result to
 * `send(encrypted, messageKey)`. If the server says the devices changed (someone
 * added or removed one), re-encrypt for the new list and try once more.
 */
export async function encryptAndSend(conversationId, content, send) {
  assertReady();
  let devices = await devicesFor(conversationId);
  for (let attempt = 0; ; attempt += 1) {
    const { encrypted, messageKey } = await encryptContent({ content, conversationId, me: me(), devices });
    try {
      return { result: await send(encrypted, messageKey), messageKey };
    } catch (error) {
      if (error.code !== 'DEVICES_CHANGED' || attempt > 0) throw error;
      devices = error.details?.devices ?? (await devicesFor(conversationId, { fresh: true }));
      deviceCache.set(conversationId, { devices, at: Date.now() });
    }
  }
}

/** The plaintext content of a message we send (everything the server must not see). */
export function buildContent({ body = '', sticker = null, location = null, liveMinutes = null, replyTo = null, attachments = [] }) {
  const content = { v: 1, t: body };
  if (sticker) content.st = sticker;
  if (location && !liveMinutes) content.loc = { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy ?? null };
  if (liveMinutes) content.live = liveMinutes;
  if (replyTo) {
    // A short copy of the quoted message, so the reply shows it without the server knowing it.
    content.q = { t: (replyTo.body ?? '').slice(0, 200), st: replyTo.sticker ?? undefined, k: replyTo.attachments?.[0]?.kind ?? replyTo.attachmentKind ?? undefined };
  }
  if (attachments.length) content.at = attachments;
  return content;
}

// ---------- reading messages ----------

const messageKeys = new Map(); // messageId -> message key (for live location updates)
const textBuffer = [];
let flushTimer = null;

/** Remember decrypted text so search works on this device (batched writes). */
function indexText(message, text) {
  if (!text || !message.id || !session.userId) return;
  textBuffer.push({ id: message.id, ownerId: session.userId, conversationId: message.conversationId, senderId: message.senderId, text, createdAt: message.createdAt });
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => keystore.saveTexts(textBuffer.splice(0)).catch(() => {}), 500);
}

async function openLocation(messageId, location) {
  const key = messageKeys.get(messageId) ?? (await keystore.getLiveKey(messageId).catch(() => null));
  if (!key || !location?.encrypted) return location;
  for (const id of [messageId, 0]) {
    try {
      const position = await openWithMessageKey(key, id, { ciphertext: location.encrypted.cipher, iv: location.encrypted.iv });
      return { ...location, latitude: position.lat, longitude: position.lng, accuracy: position.acc ?? null, encrypted: undefined };
    } catch {
      // the first position is sealed before the message has an id (0)
    }
  }
  return location;
}

/** An encrypted GIF I sent: remember it (and its key) on this device for "Recent GIFs". */
function rememberGif(message, attachment, info) {
  if (message.senderId !== session.userId || info.mime !== 'image/gif' || !attachment.id) return;
  keystore
    .saveGif({ attachmentId: attachment.id, ownerId: session.userId, url: attachment.url, key: info.key, iv: info.iv, w: info.w ?? null, h: info.h ?? null, size: info.size ?? null })
    .catch(() => {});
}

/** My recent encrypted GIFs, ready to show (their keys are registered for decryption). */
export async function recentEncryptedGifs() {
  if (!session.userId || !keystore.available()) return [];
  const gifs = await keystore.recentGifs(session.userId).catch(() => []);
  for (const gif of gifs) fileKeys.set(gif.url, { key: gif.key, iv: gif.iv, mime: 'image/gif' });
  return gifs.map((g) => ({ id: g.attachmentId, url: g.url, width: g.w, height: g.h, mimeType: 'image/gif', encrypted: true, meta: { key: g.key, iv: g.iv, name: 'GIF.gif', mime: 'image/gif', size: g.size ?? undefined, w: g.w ?? undefined, h: g.h ?? undefined } }));
}

function applyContent(message, content) {
  const meta = new Map((content.at ?? []).map((a) => [a.id, a]));
  const attachments = (message.attachments ?? []).map((attachment) => {
    const info = meta.get(attachment.id);
    if (!info) return attachment; // not encrypted (a GIF from GIPHY, a sticker from my library)
    fileKeys.set(attachment.url, { key: info.key, iv: info.iv, mime: info.mime });
    rememberGif(message, attachment, info);
    if (info.tiv && attachment.thumbnailUrl) fileKeys.set(attachment.thumbnailUrl, { key: info.key, iv: info.tiv, mime: 'image/jpeg' });
    return {
      ...attachment,
      name: info.name ?? 'file',
      mimeType: info.mime ?? 'application/octet-stream',
      size: info.size ?? attachment.size,
      width: info.w ?? null,
      height: info.h ?? null,
      durationMs: info.dur ?? null,
      pageCount: info.pages ?? null,
    };
  });
  const first = content.at?.[0];
  return {
    ...message,
    body: content.t ?? '',
    sticker: content.st ?? null,
    attachments,
    attachmentSummary: message.attachmentSummary && first ? { ...message.attachmentSummary, name: first.name, durationMs: first.dur ?? null } : message.attachmentSummary,
    location: content.loc ? { ...content.loc, live: false, active: false } : message.location,
    replyTo: message.replyTo?.encrypted
      ? { ...message.replyTo, body: content.q?.t ?? '', sticker: content.q?.st ?? null, attachmentKind: content.q?.k ?? message.replyTo.attachmentKind }
      : message.replyTo,
    encrypted: true,
    content,
    e2ee: undefined,
  };
}

/** Decrypt a message from the server (no-op for plaintext ones). Never throws. */
export async function decryptMessage(message) {
  if (!message?.e2ee) return message;
  const failed = (reason) => ({ ...message, body: '', sticker: null, attachments: [], attachmentSummary: null, location: null, encrypted: true, undecryptable: reason, e2ee: undefined });
  if (session.status !== 'ready') return failed(session.status === 'unavailable' ? 'unavailable' : 'not-ready');
  try {
    const { content, messageKey } = await decryptContent({ e2ee: message.e2ee, conversationId: message.conversationId, senderId: message.senderId, me: me() });
    if (message.id) messageKeys.set(message.id, messageKey);
    const decrypted = applyContent(message, content);
    if (decrypted.location?.encrypted) decrypted.location = await openLocation(message.id, decrypted.location);
    indexText(decrypted, content.t);
    return decrypted;
  } catch (error) {
    return failed(error.code === 'NO_KEY' ? 'no-key' : 'failed');
  }
}

export const decryptMessages = (messages = []) => Promise.all(messages.map(decryptMessage));

export async function decryptConversation(conversation) {
  if (!conversation?.lastMessage?.e2ee) return conversation;
  return { ...conversation, lastMessage: await decryptMessage(conversation.lastMessage) };
}

/**
 * Pins carry the same payload as messages (but `messageId` instead of `id`, and no
 * conversationId, which decryption needs: it is part of the ciphertext's authenticated data).
 */
export async function decryptPin(pin, conversationId) {
  if (!pin?.e2ee) return pin;
  const message = await decryptMessage({ ...pin, conversationId: pin.conversationId ?? conversationId, id: pin.messageId, attachments: [] });
  return { ...pin, body: message.body, sticker: message.sticker, attachmentSummary: message.attachmentSummary, undecryptable: message.undecryptable, e2ee: undefined };
}

/** A live location moved: decrypt its new position with the message's key. */
export async function decryptLocationUpdate(update) {
  if (!update.location?.encrypted) return update;
  return { ...update, location: await openLocation(update.messageId, update.location) };
}

// ---------- live locations I share ----------

export async function rememberLiveKey(messageId, messageKey) {
  messageKeys.set(messageId, messageKey);
  await keystore.saveLiveKey(messageId, messageKey).catch(() => {});
}

export async function sealLivePosition(messageId, { latitude, longitude, accuracy }) {
  const key = messageKeys.get(messageId) ?? (await keystore.getLiveKey(messageId).catch(() => null));
  if (!key) return null;
  return sealWithMessageKey(key, messageId, { lat: latitude, lng: longitude, acc: accuracy ?? null });
}

export const sealFirstPosition = (messageKey, { latitude, longitude, accuracy }) =>
  sealWithMessageKey(messageKey, 0, { lat: latitude, lng: longitude, acc: accuracy ?? null });

// ---------- files ----------

const fileKeys = new Map(); // attachment url -> { key, iv, mime }
const fileCache = new Map(); // url -> Promise<objectURL>

export const isEncryptedFile = (url) => fileKeys.has(url);

/** Decrypt downloaded ciphertext of `url` (null if it isn't an encrypted file we know). */
export async function decryptFile(url, data) {
  const info = fileKeys.get(url);
  if (!info) return null;
  return new Blob([await decryptBytes(data, info.key, info.iv)], { type: info.mime });
}

/** An object URL with the decrypted file, fetched once and shared by every view of it. */
export function decryptedUrl(url, fetchBytes) {
  if (!fileCache.has(url)) {
    const promise = fetchBytes(url)
      .then((data) => decryptFile(url, data))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null));
    promise.catch(() => fileCache.delete(url)); // allow a retry
    fileCache.set(url, promise);
  }
  return fileCache.get(url);
}

/** Encrypt a file (and its preview) before upload. Returns the ciphertext blobs and their key. */
export async function encryptUpload(blob, thumbnail) {
  const sealed = await encryptBytes(await blob.arrayBuffer());
  const thumb = thumbnail ? await encryptBytes(await thumbnail.arrayBuffer(), sealed.key) : null;
  return {
    blob: new Blob([sealed.ciphertext], { type: 'application/octet-stream' }),
    thumbnail: thumb ? new Blob([thumb.ciphertext], { type: 'application/octet-stream' }) : null,
    key: sealed.key,
    iv: sealed.iv,
    tiv: thumb?.iv ?? null,
  };
}

// ---------- search & verification ----------

export async function searchLocal(query, { conversationId } = {}) {
  if (!session.userId || !keystore.available()) return [];
  return keystore.searchTexts(session.userId, query, { conversationId }).catch(() => []);
}

/** Start reading this device's saved texts before the search runs (while the user types). */
export function warmSearch() {
  if (session.userId && keystore.available()) keystore.warmTexts(session.userId);
}

export const forgetText = (messageId) => keystore.deleteText(messageId).catch(() => {});

/**
 * The 60-digit security code between me and `otherUserId` (same on both phones
 * when nobody is in the middle), plus both sides' devices.
 */
export async function securityCodeWith(otherUserId) {
  const [mine, theirs] = await Promise.all([
    http.get(`/e2ee/users/${encodeURIComponent(session.userId)}/devices`),
    http.get(`/e2ee/users/${encodeURIComponent(otherUserId)}/devices`),
  ]);
  const code = await securityCode(
    session.userId,
    mine.devices.map((d) => d.publicKey),
    otherUserId,
    theirs.devices.map((d) => d.publicKey),
  );
  return { code, myDevices: mine.devices.length, theirDevices: theirs.devices.length };
}
