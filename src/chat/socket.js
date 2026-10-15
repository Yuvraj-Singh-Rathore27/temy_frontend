import { io } from 'socket.io-client';
import { API_URL, tokenStore } from '../api/client.js';
import { deviceStore } from '../e2ee/device.js';

/**
 * Identifies this browser tab for the whole page lifetime, across reconnects
 * (a call belongs to the tab that placed or answered it).
 */
export const TAB_ID = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);

/**
 * Create the (not yet connected) Socket.IO client. The access token is read on
 * every (re)connect attempt, so a refreshed token is picked up automatically.
 */
export function createSocket() {
  return io(API_URL || undefined, {
    autoConnect: false,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    auth: (cb) => cb({ token: tokenStore.get(), tabId: TAB_ID, deviceId: deviceStore.get() }),
  });
}

/** emit + ack as a promise that rejects on timeout or `{ ok: false }`. */
export async function emitWithAck(socket, event, payload, timeoutMs = 10_000) {
  const reply = await socket.timeout(timeoutMs).emitWithAck(event, payload);
  if (!reply?.ok) {
    const error = new Error(reply?.error?.message ?? 'Request failed');
    error.code = reply?.error?.code;
    error.details = reply?.error?.details;
    throw error;
  }
  return reply.data;
}
