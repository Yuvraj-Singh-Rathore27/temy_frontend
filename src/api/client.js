import { deviceStore } from '../e2ee/device.js';
/**
 * HTTP client for the chat API.
 *
 * - The access token lives only in memory (never localStorage), so an XSS bug
 *   cannot read a long-lived credential.
 * - The refresh token is an httpOnly cookie scoped to /api/auth; we trade it for
 *   a new access token when the current one expires.
 * - Concurrent 401s share a single refresh request.
 */
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Absolute URL for a server path such as "/uploads/avatars/…". */
/** API paths get the API origin; absolute URLs (e.g. a GIF preview from GIPHY) are used as they are. */
export const assetUrl = (pathname) => (!pathname ? null : /^https?:\/\//.test(pathname) ? pathname : `${API_URL}${pathname}`);

let accessToken = null;
let refreshPromise = null;
const authListeners = new Set();

export class ApiError extends Error {
  constructor(status, { code = 'UNKNOWN', message = 'Something went wrong', details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Map of field -> message for form validation errors. */
  get fieldErrors() {
    const result = {};
    if (!Array.isArray(this.details)) return result;
    for (const issue of this.details) {
      if (issue.field && !result[issue.field]) result[issue.field] = issue.message;
    }
    return result;
  }
}

export const tokenStore = {
  get: () => accessToken,
  set(token) {
    accessToken = token;
  },
  clear() {
    accessToken = null;
  },
};

/** Notified with the new session ({ user, accessToken }) or null when the session ends. */
export function onAuthChange(listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function emitAuthChange(session) {
  for (const listener of authListeners) listener(session);
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new ApiError(response.status, body?.error ?? { message: defaultMessage(response.status) });
  }
  return body;
}

function defaultMessage(status) {
  if (status === 429) return 'Too many requests. Please wait a moment.';
  if (status >= 500) return 'The server had a problem. Please try again.';
  return 'Request failed';
}

async function rawFetch(path, { method = 'GET', body, headers = {}, signal, auth = true } = {}) {
  const finalHeaders = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...headers };
  // Encrypted messages come back with this device's key only.
  if (auth && deviceStore.get()) finalHeaders['X-Device-Id'] = String(deviceStore.get());
  const isForm = body instanceof FormData;
  // FormData sets its own multipart boundary header.
  if (body !== undefined && !isForm) finalHeaders['Content-Type'] = 'application/json';
  if (auth && accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined || isForm ? body : JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check your connection.' });
  }
  return parseResponse(response);
}

/**
 * Exchange the refresh cookie for a fresh access token. Resolves with
 * { user, accessToken } or null when there is no valid session.
 */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = rawFetch('/auth/refresh', { method: 'POST', auth: false })
      .then((session) => {
        tokenStore.set(session.accessToken);
        emitAuthChange(session);
        return session;
      })
      .catch((error) => {
        // Network failures keep the current state; only a rejected session logs out.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          tokenStore.clear();
          emitAuthChange(null);
          return null;
        }
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** Authenticated request with one transparent retry after refreshing an expired token. */
export async function request(path, options = {}) {
  try {
    return await rawFetch(path, options);
  } catch (error) {
    const canRetry = options.auth !== false && error instanceof ApiError && error.status === 401;
    if (!canRetry) throw error;
    const session = await refreshSession();
    if (!session) throw error;
    return rawFetch(path, options);
  }
}

export const http = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
