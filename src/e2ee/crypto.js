/**
 * Vestige Chat end-to-end encryption, built only on the standard Web Crypto API (so it
 * runs unchanged in browsers and in the server's tests).
 *
 * - Every device has an ECDH P-256 key pair. The private key is created
 *   non-extractable: even Vestige Chat's own code can't read it out.
 * - Every message gets a fresh random 256-bit key. The content is encrypted
 *   with AES-256-GCM, bound (as additional data) to the chat, the sender and
 *   the sending device, so it can't be moved or re-attributed by the server.
 * - That message key is wrapped for each device allowed to read the message:
 *   ECDH(sender device, recipient device) → HKDF-SHA-256 (random salt, both
 *   device ids as context) → AES-256-GCM.
 * - Files are encrypted with their own random key, which travels inside the
 *   (encrypted) message.
 */
const subtle = globalThis.crypto?.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VERSION = 'temu:v1';

/** Web Crypto is only available on secure pages (HTTPS or localhost). */
export const cryptoAvailable = () => Boolean(subtle);

// ---- encoding helpers ----

export function toB64(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromB64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const random = (length) => globalThis.crypto.getRandomValues(new Uint8Array(length));
const aesKey = (raw, usages = ['encrypt', 'decrypt']) => subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages);

// ---- device keys ----

/** A new device key pair. The private key can be used but never exported. */
export function generateDeviceKeys() {
  return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
}

export async function exportPublicKey(publicKey) {
  return toB64(await subtle.exportKey('raw', publicKey));
}

const publicKeyCache = new Map();
function importPublicKey(b64) {
  if (!publicKeyCache.has(b64)) {
    publicKeyCache.set(b64, subtle.importKey('raw', fromB64(b64), { name: 'ECDH', namedCurve: 'P-256' }, false, []));
  }
  return publicKeyCache.get(b64);
}

/** AES key that wraps a message key between two devices. */
async function wrappingKey(privateKey, peerPublicKey, salt, senderDeviceId, recipientDeviceId) {
  const shared = await subtle.deriveBits({ name: 'ECDH', public: await importPublicKey(peerPublicKey) }, privateKey, 256);
  const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(`${VERSION}:wrap:${senderDeviceId}:${recipientDeviceId}`) },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const contentAad = (conversationId, senderId, senderDeviceId) => encoder.encode(`${VERSION}:${conversationId}:${senderId}:${senderDeviceId}`);

// ---- messages ----

/**
 * Encrypt a message's content for a set of devices.
 * `me`: { userId, deviceId, privateKey }; `devices`: [{ id, publicKey }] (must include my own).
 * Returns { encrypted, messageKey } — `encrypted` is what the server stores.
 */
export async function encryptContent({ content, conversationId, me, devices, messageKey = random(32) }) {
  const iv = random(12);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: contentAad(conversationId, me.userId, me.deviceId) },
    await aesKey(messageKey),
    encoder.encode(JSON.stringify(content)),
  );
  const keys = await Promise.all(
    devices.map(async (device) => {
      const salt = random(16);
      const wrapIv = random(12);
      const key = await wrappingKey(me.privateKey, device.publicKey, salt, me.deviceId, device.id);
      const wrapped = await subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, key, messageKey);
      return { deviceId: device.id, wrapped: toB64(wrapped), salt: toB64(salt), iv: toB64(wrapIv) };
    }),
  );
  return { encrypted: { ciphertext: toB64(ciphertext), iv: toB64(iv), senderDeviceId: me.deviceId, keys }, messageKey };
}

/**
 * Decrypt a message payload from the server (`e2ee`: { ciphertext, iv, senderDeviceId,
 * senderPublicKey, keys: { [deviceId]: { wrapped, salt, iv } } }).
 * Returns { content, messageKey } or throws (e.g. NO_KEY: sent before this device existed).
 */
export async function decryptContent({ e2ee, conversationId, senderId, me }) {
  const envelope = e2ee.keys?.[me.deviceId];
  if (!envelope) throw Object.assign(new Error('No key for this device'), { code: 'NO_KEY' });
  if (!e2ee.senderPublicKey) throw Object.assign(new Error('Unknown sender device'), { code: 'NO_SENDER' });
  const key = await wrappingKey(me.privateKey, e2ee.senderPublicKey, fromB64(envelope.salt), e2ee.senderDeviceId, me.deviceId);
  const messageKey = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.wrapped)));
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(e2ee.iv), additionalData: contentAad(conversationId, senderId, e2ee.senderDeviceId) },
    await aesKey(messageKey),
    fromB64(e2ee.ciphertext),
  );
  return { content: JSON.parse(decoder.decode(plaintext)), messageKey };
}

/** Small follow-up data under an existing message key (live location positions). */
export async function sealWithMessageKey(messageKey, messageId, value) {
  const iv = random(12);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${VERSION}:loc:${messageId}`) },
    await aesKey(messageKey),
    encoder.encode(JSON.stringify(value)),
  );
  return { ciphertext: toB64(ciphertext), iv: toB64(iv) };
}

export async function openWithMessageKey(messageKey, messageId, { ciphertext, iv }) {
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv), additionalData: encoder.encode(`${VERSION}:loc:${messageId}`) },
    await aesKey(messageKey),
    fromB64(ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext));
}

// ---- files ----

/** Encrypt file bytes with a new key (or `keyB64`, e.g. a thumbnail of the same file). */
export async function encryptBytes(data, keyB64 = null) {
  const key = keyB64 ? fromB64(keyB64) : random(32);
  const iv = random(12);
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(key), data);
  return { ciphertext, key: toB64(key), iv: toB64(iv) };
}

export async function decryptBytes(data, keyB64, ivB64) {
  return subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, await aesKey(fromB64(keyB64)), data);
}

// ---- security codes ----

/**
 * A 60-digit security code for two people, from both users' device keys. It is
 * the same on both sides; if it differs, someone's keys are not what they seem.
 */
export async function securityCode(userA, keysA, userB, keysB) {
  const half = async (userId, keys) => {
    const digest = new Uint8Array(await subtle.digest('SHA-256', encoder.encode(`${VERSION}:${userId}:${[...keys].sort().join(',')}`)));
    let digits = '';
    for (let i = 0; i < 30; i += 5) {
      // 40 bits per group (multiplication, not <<, which would wrap at 32 bits).
      const chunk = digest[i] * 2 ** 32 + digest[i + 1] * 2 ** 24 + digest[i + 2] * 2 ** 16 + digest[i + 3] * 2 ** 8 + digest[i + 4];
      digits += String(chunk % 100000).padStart(5, '0');
    }
    return digits;
  };
  const [a, b] = await Promise.all([half(userA, keysA), half(userB, keysB)]);
  return Number(userA) < Number(userB) ? a + b : b + a;
}
