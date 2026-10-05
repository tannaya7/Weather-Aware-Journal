const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB — limit when a photo can't be shrunk
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20MB — anything bigger isn't a sensible photo
const MAX_DIMENSION = 1280; // px on the longest side, plenty for a journal photo
const JPEG_QUALITY = 0.8;
const SHRINK_ABOVE_BYTES = 400 * 1024;

function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(blob);
  });
}

// Scales a photo down to MAX_DIMENSION and re-encodes it as JPEG, since
// every photo is stored in localStorage (~5MB for the whole journal).
// Returns null when the browser can't do it (or the photo is already
// small), and the caller keeps the original.
async function shrinkImage(file) {
  if (typeof createImageBitmap !== 'function') return null;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SHRINK_ABOVE_BYTES) {
    bitmap.close?.();
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return null;
  }

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

// Reads an <input type="file"> image into a base64 data URL for storage,
// since this app has no backend to upload to. Large photos are shrunk first.
export async function readImageFile(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That image is too large (max 20MB).');
  }

  const shrunk = await shrinkImage(file);
  if (shrunk) return shrunk;

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('That image is too large (max 3MB).');
  }
  return readAsDataURL(file);
}
