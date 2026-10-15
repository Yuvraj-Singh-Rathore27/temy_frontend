/**
 * This tab's encryption device id (set once the device is registered). Sent as
 * X-Device-Id on API requests and in the socket handshake, so encrypted messages
 * come back with this device's key. No imports here (used by the API client).
 */
let currentDeviceId = null;

export const deviceStore = {
  get: () => currentDeviceId,
  set: (id) => {
    currentDeviceId = id ?? null;
  },
};
