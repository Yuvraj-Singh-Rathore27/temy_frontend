import { pdfPreview } from './pdf.js';
// Mirrors the server's per-kind limits (server/.env MAX_*_MB). The server enforces them.
export const MAX_BYTES = {
  image: 16 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
  audio: 32 * 1024 * 1024,
  voice: 32 * 1024 * 1024,
  file: 1024 * 1024 * 1024,
};
export const MAX_FILES_PER_MESSAGE = 10;

const MAX_IMAGE_SIDE = 2048;
const IMAGE_QUALITY = 0.82;
const THUMB_SIDE = 480;

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** 75_000 → "1:15" */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** How a picked file will be sent. Browsers that can't play a format still get it as a file. */
export function classifyFile(file) {
  const type = file.type || '';
  if (/^image\/(jpeg|png|gif|webp)$/.test(type)) return 'image';
  if (/^video\/(mp4|webm|quicktime)$/.test(type)) return 'video';
  if (/^audio\//.test(type)) return 'audio';
  return 'file';
}

/** Short text for previews and quotes: "📷 Photo", "🎤 Voice message (0:09)", "📄 report.pdf". */
export function attachmentLabel({ kind, count = 1, durationMs, name } = {}) {
  switch (kind) {
    case 'image':
      if (count === 1 && /\.gif$/i.test(name ?? '')) return '🎞️ GIF';
      return count > 1 ? `📷 ${count} photos` : '📷 Photo';
    case 'sticker':
      return '🩷 Sticker';
    case 'video':
      return count > 1 ? `🎥 ${count} videos` : '🎥 Video';
    case 'voice':
      return `🎤 Voice message${durationMs ? ` (${formatDuration(durationMs)})` : ''}`;
    case 'audio':
      return `🎵 ${name || 'Audio'}`;
    case 'file':
      return `📄 ${name || 'File'}`;
    default:
      return '';
  }
}

/** Summary of a message's attachments (server sends `attachmentSummary` for chat previews). */
export function summarizeAttachments(message) {
  if (message?.attachmentSummary) return message.attachmentSummary;
  const list = message?.attachments ?? [];
  if (list.length === 0) return null;
  const first = list[0];
  return { kind: first.kind, count: list.length, durationMs: first.durationMs, name: first.name };
}

export const locationLabel = (live) => (live ? '📍 Live location' : '📍 Location');

/** One-line preview text of a message (chat list, pinned bar, quotes). */
export function messagePreview(message) {
  if (message?.location) return locationLabel(message.location.live);
  if (message?.sticker) return '🩷 Sticker';
  if (message?.undecryptable) return '🔒 Encrypted message';
  const summary = summarizeAttachments(message);
  const label = summary ? attachmentLabel(summary) : '';
  if (label && message.body) return `${label.split(' ')[0]} ${message.body}`;
  return label || message?.body || '';
}

function loadImage(file) {
  return createImageBitmap(file).catch(() => {
    throw new Error(`"${file.name}" could not be read as an image.`);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

/**
 * Resize large photos (longest side 2048px) and re-encode them as JPEG/WebP.
 * GIFs are kept as-is so animations survive. Re-encoding also strips EXIF data
 * such as GPS location. Returns { blob, width, height, name }.
 */
export async function compressImage(file) {
  const bitmap = await loadImage(file);
  const { width, height } = bitmap;
  if (file.type === 'image/gif') {
    bitmap.close?.();
    return { blob: file, width, height, name: file.name };
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // PNGs may be transparent: WebP keeps transparency, JPEG would turn it black.
  const preferWebp = file.type === 'image/png' || file.type === 'image/webp';
  let blob = preferWebp ? await canvasToBlob(canvas, 'image/webp', IMAGE_QUALITY) : null;
  if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_QUALITY);
  // Never make a small, already-optimised file bigger.
  if (!blob || (scale === 1 && blob.size >= file.size)) return { blob: file, width, height, name: file.name };
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return { blob, width: w, height: h, name: file.name.replace(/\.[^.]+$/, '') + `.${ext}` };
}

/** Read a video's size and duration and grab a JPEG poster frame. */
export function inspectVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ width: null, height: null, durationMs: null, thumbnail: null }), 8000);

    video.onloadedmetadata = () => {
      // A frame slightly in, so the poster isn't black.
      video.currentTime = Math.min(1, (video.duration || 0) / 3);
    };
    video.onseeked = async () => {
      clearTimeout(timer);
      const { videoWidth: width, videoHeight: height } = video;
      let thumbnail = null;
      if (width && height) {
        const scale = Math.min(1, THUMB_SIDE / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbnail = await canvasToBlob(canvas, 'image/jpeg', 0.75);
      }
      finish({ width: width || null, height: height || null, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null, thumbnail });
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish({ width: null, height: null, durationMs: null, thumbnail: null });
    };
    video.src = url;
  });
}

/** Duration of an audio file in ms (null if the browser can't read it). */
export function audioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const done = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

/**
 * Turn picked files into upload items: compressing photos, reading video/audio
 * metadata and checking size limits. `asFiles` sends everything as documents
 * (original quality). Returns { items, errors }.
 */
export async function prepareFiles(files, { asFiles = false } = {}) {
  const items = [];
  const errors = [];
  for (const file of files) {
    try {
      let kind = asFiles ? 'file' : classifyFile(file);
      const item = {
        localId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        source: file, // the picked File, so callers can remove it from their list
        kind,
        name: file.name,
        blob: file,
        mimeType: file.type,
      };
      if (kind === 'image') {
        const compressed = await compressImage(file);
        Object.assign(item, { blob: compressed.blob, name: compressed.name, width: compressed.width, height: compressed.height });
      } else if (kind === 'video') {
        Object.assign(item, await inspectVideo(file));
      } else if (kind === 'audio') {
        item.durationMs = await audioDuration(file);
      } else if (kind === 'file' && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
        // First page as a preview, so the chat shows what the document is.
        const preview = await pdfPreview(file);
        if (preview) Object.assign(item, preview);
      }
      if (item.blob.size > MAX_BYTES[kind]) {
        if (kind === 'image' || kind === 'video') kind = 'file'; // too big to preview inline: try as a document
        if (item.blob.size > MAX_BYTES[kind]) throw new Error(`"${file.name}" is too large (max ${formatBytes(MAX_BYTES[kind])}).`);
        item.kind = kind;
      }
      if (item.blob.size === 0) throw new Error(`"${file.name}" is empty.`);
      item.size = item.blob.size;
      item.mimeType = item.blob.type || file.type;
      item.previewUrl = item.kind === 'file' ? null : URL.createObjectURL(item.blob);
      item.posterUrl = item.thumbnail ? URL.createObjectURL(item.thumbnail) : null; // video poster or PDF first page
      items.push(item);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { items, errors };
}
