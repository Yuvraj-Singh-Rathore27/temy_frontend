const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/**
 * Center-crop an image file to a square and scale it to `size` px, returning a
 * JPEG/WebP blob well under the server's 2 MB limit. Re-encoding also strips EXIF
 * metadata (e.g. GPS location) from phone photos.
 */
export async function prepareAvatar(file, size = 512) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is too large (max 15 MB).');

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This image could not be read. Try a JPG or PNG.');
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();

  const blob = (await toBlob(canvas, 'image/webp', 0.88)) ?? (await toBlob(canvas, 'image/jpeg', 0.88));
  if (!blob) throw new Error('This image could not be processed.');
  return blob;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob?.type === type ? blob : null), type, quality));
}

const STICKER_MAX_BYTES = 500 * 1024;

/**
 * Turn a picked image into a sticker: a square (centre crop, transparency kept),
 * 512 px, as WebP (PNG where the browser can't encode WebP). Small GIFs stay
 * as they are so their animation survives. Returns { blob, width, height }.
 */
export async function prepareSticker(file) {
  if (file.type === 'image/gif' && file.size <= STICKER_MAX_BYTES) {
    const bitmap = await createImageBitmap(file);
    return { blob: file, width: bitmap.width, height: bitmap.height };
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This image could not be read. Try a JPG, PNG or WebP.');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  for (const size of [512, 384, 256]) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas
      .getContext('2d')
      .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob && blob.size <= STICKER_MAX_BYTES) return { blob, width: size, height: size };
  }
  throw new Error('This image is too detailed to become a sticker. Try another one.');
}
