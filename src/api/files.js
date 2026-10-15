import { decryptFile } from '../e2ee/session.js';
import { API_URL, ApiError, assetUrl, refreshSession, tokenStore } from './client.js';

/**
 * Upload one attachment with progress and cancellation (XHR: fetch has no upload progress).
 * Resolves with the server's attachment object. Retries once after refreshing an expired token.
 */
export function uploadAttachment(item, { conversationId, onProgress, signal }, isRetry = false) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('conversationId', String(conversationId));
    if (item.encrypted) {
      // End-to-end encrypted: the server gets opaque bytes and only the kind (for its size
      // limit and the gallery tabs). Name, type, size details and the key are in the message.
      form.append('encrypted', 'true');
      form.append('kind', item.kind);
    } else {
      if (item.kind === 'voice' || item.kind === 'file') form.append('kind', item.kind);
      if (item.kind === 'audio') form.append('kind', 'audio');
      if (item.width) form.append('width', String(item.width));
      if (item.height) form.append('height', String(item.height));
      if (item.durationMs != null) form.append('durationMs', String(item.durationMs));
      if (item.pageCount) form.append('pageCount', String(item.pageCount));
    }
    form.append('file', item.blob, item.encrypted ? 'encrypted' : item.name);
    if (item.thumbnail) form.append('thumbnail', item.thumbnail, 'thumbnail.jpg');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/attachments`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    if (tokenStore.get()) xhr.setRequestHeader('Authorization', `Bearer ${tokenStore.get()}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = async () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body.attachment);
      if (xhr.status === 401 && !isRetry) {
        try {
          if (await refreshSession()) return resolve(await uploadAttachment(item, { conversationId, onProgress, signal }, true));
        } catch {
          // fall through to the error below
        }
      }
      reject(new ApiError(xhr.status, body?.error ?? { message: xhr.status === 413 ? 'The file is too large' : 'Upload failed' }));
    };
    xhr.onerror = () => reject(new ApiError(0, { code: 'NETWORK_ERROR', message: 'Upload failed. Check your connection.' }));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    if (signal?.aborted) return xhr.onabort();
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/**
 * Fetch an attachment's bytes with progress (bearer token, refreshed once if it
 * expired). Used for downloads and for the in-app document viewer.
 */
export async function fetchAttachmentBlob(attachment, { onProgress, signal } = {}) {
  const url = `${assetUrl(attachment.url)}?download=1`;
  const fetchOnce = () =>
    fetch(url, {
      credentials: 'include',
      headers: tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {},
      signal,
    });

  let response = await fetchOnce();
  if (response.status === 401 && (await refreshSession())) response = await fetchOnce();
  if (!response.ok) throw new ApiError(response.status, { message: response.status === 404 ? 'This file is no longer available' : 'Download failed' });

  const total = Number(response.headers.get('Content-Length')) || attachment.size || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress?.(Math.min(1, received / total));
  }
  const blob = new Blob(chunks, { type: attachment.mimeType || 'application/octet-stream' });
  // End-to-end encrypted: decrypt with the key that came inside the message.
  return (await decryptFile(attachment.url, await blob.arrayBuffer())) ?? blob;
}

/** Ciphertext of a file (for decrypting it into something an <img>/<video> can show). */
export async function fetchAttachmentBytes(url) {
  const fetchOnce = () =>
    fetch(`${assetUrl(url)}${url.includes('?') ? '&' : '?'}download=1`, {
      credentials: 'include',
      headers: tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {},
    });
  let response = await fetchOnce();
  if (response.status === 401 && (await refreshSession())) response = await fetchOnce();
  if (!response.ok) throw new ApiError(response.status, { message: 'This file is no longer available' });
  return response.arrayBuffer();
}

/** Download an attachment with progress, then hand it to the browser as a file. */
export async function downloadAttachment(attachment, options = {}) {
  const blob = await fetchAttachmentBlob(attachment, options);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = attachment.name || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

let mediaRefresh = null;
/**
 * Images/videos authenticate with the media cookie, which follows the access
 * token. If one fails to load (e.g. the token just expired), refresh once —
 * shared by every element on the page — and let it retry.
 */
export function refreshMediaSession() {
  mediaRefresh ??= refreshSession()
    .catch(() => null)
    .finally(() => {
      setTimeout(() => {
        mediaRefresh = null;
      }, 10_000);
    });
  return mediaRefresh;
}
