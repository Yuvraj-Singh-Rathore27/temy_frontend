/**
 * Browser notifications, Web Push subscription and the notification sound.
 * Everything degrades gracefully: unsupported browsers simply get in-app notices.
 */

export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const pushSupported = () => notificationsSupported() && 'PushManager' in window;

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

let registrationPromise = null;
export function getRegistration() {
  if (!notificationsSupported()) return Promise.resolve(null);
  registrationPromise ??= navigator.serviceWorker.register('/sw.js').catch(() => null);
  return registrationPromise;
}

/** VAPID public key (base64url) → Uint8Array, as PushManager wants. */
function keyToBytes(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** Ask permission (must be called from a click). Returns the resulting permission. */
export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/** Current push subscription of this browser, if any. */
export async function currentSubscription() {
  if (!pushSupported()) return null;
  const registration = await getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Subscribe this browser for push; returns the subscription as JSON for the server. */
export async function subscribePush(publicKey) {
  const registration = await getRegistration();
  if (!registration) throw new Error('Notifications are not supported in this browser.');
  let subscription = await registration.pushManager.getSubscription();
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
  return subscription.toJSON();
}

export async function unsubscribePush() {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

/** System notification while the tab is in the background. Clicking it opens `url`. */
export async function showSystemNotification({ title, body, tag, url }) {
  if (notificationPermission() !== 'granted') return false;
  const registration = await getRegistration();
  if (!registration) return false;
  await registration.showNotification(title, { body, tag, renotify: Boolean(tag), icon: '/favicon.svg', data: { url } });
  return true;
}

let audioContext = null;
/** Short two-tone chime, synthesized (no sound file to download). */
export function playNotificationSound() {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    for (const [frequency, start] of [
      [880, 0],
      [1320, 0.12],
    ]) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.25);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + 0.3);
    }
  } catch {
    // Audio not allowed yet (no user interaction) — silently skip.
  }
}

/** Does `text` @mention someone called `name` (full or first name)? Mirrors the server. */
export function mentionsName(text, name) {
  if (!text || !name) return false;
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const first = name.trim().split(/\s+/)[0];
  const names = [...new Set([name.trim(), first])].map(escape).join('|');
  return new RegExp(`(^|[^\\w@])@(${names})(?![\\w])`, 'iu').test(text);
}
