import { getEntryImages } from './entryImages.js';
import { dataUrlBytes } from './storageQuota.js';

// Makes photos that are already stored smaller, to save room on the device
// and keep the journal under what sync accepts. New photos are shrunk when
// they are added (imageUpload.js); this is for the ones saved before, or
// from the days the limits were looser.
//
// It can be stopped and started again: photos that are already small, or
// that would not shrink by enough, are left alone, so each run only does
// what is left.

export const SHRINK_DEFAULTS = {
  // Longest side, in pixels. Sharp on any screen the journal is read on.
  maxEdge: 1280,
  quality: 0.78,
  // Leave photos at or below this size alone: not worth the quality loss.
  skipBelowBytes: 150 * 1024,
  // Only replace a photo if the new one is at least this much smaller.
  minSaving: 0.15,
};

function dataUrlToBlob(url) {
  const comma = url.indexOf(',');
  const header = url.slice(0, comma);
  const type = /^data:([^;,]+)/.exec(header)?.[1] || 'image/jpeg';
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

// One photo, re-drawn smaller and saved as JPEG. Null when the browser
// can't (or the photo is not a data URL we can read).
export async function shrinkDataUrl(url, { maxEdge, quality } = SHRINK_DEFAULTS) {
  if (typeof createImageBitmap !== 'function' || typeof url !== 'string' || !url.startsWith('data:image/')) return null;
  let bitmap;
  try {
    bitmap = await createImageBitmap(dataUrlToBlob(url));
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    bitmap.close?.();
  }
}

// The photos a run would work on: how many, and how much they take now.
export function shrinkable(entries, options = SHRINK_DEFAULTS) {
  let photos = 0;
  let bytes = 0;
  for (const entry of entries) {
    for (const image of getEntryImages(entry)) {
      const size = dataUrlBytes(image);
      if (size > options.skipBelowBytes) {
        photos++;
        bytes += size;
      }
    }
  }
  return { photos, bytes };
}

// Shrinks the photos in `entries`, one entry at a time, saving each entry
// as soon as it is done with `update(id, { images })` (so stopping part-way
// keeps what was finished). `shrink(url, options)` makes one photo smaller;
// `onProgress({ done, total, bytesSaved })` is called after each photo;
// `shouldStop()` is checked between photos.
export async function shrinkPhotos({
  entries,
  update,
  shrink = shrinkDataUrl,
  options = SHRINK_DEFAULTS,
  onProgress,
  shouldStop,
}) {
  const work = entries.filter((e) => getEntryImages(e).some((img) => dataUrlBytes(img) > options.skipBelowBytes));
  const total = work.reduce(
    (n, e) => n + getEntryImages(e).filter((img) => dataUrlBytes(img) > options.skipBelowBytes).length,
    0,
  );

  let done = 0;
  let bytesSaved = 0;
  let photosShrunk = 0;
  let failed = 0;
  let stopped = false;

  for (const entry of work) {
    const images = getEntryImages(entry);
    const next = [];
    let changed = false;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (stopped || dataUrlBytes(image) <= options.skipBelowBytes) {
        next.push(image);
        continue;
      }
      if (shouldStop?.()) {
        stopped = true;
        next.push(image);
        continue;
      }
      const before = dataUrlBytes(image);
      let smaller = null;
      try {
        smaller = await shrink(image, options);
      } catch {
        failed++;
      }
      const after = smaller ? dataUrlBytes(smaller) : before;
      if (smaller && after <= before * (1 - options.minSaving)) {
        next.push(smaller);
        bytesSaved += before - after;
        photosShrunk++;
        changed = true;
      } else {
        next.push(image);
      }
      done++;
      onProgress?.({ done, total, bytesSaved });
    }

    // Save this entry now, so a stop (or a crash) keeps the work so far.
    if (changed) await update(entry.id, { images: next, image: undefined });
    if (stopped) break;
  }

  return { photosShrunk, bytesSaved, failed, stopped, total };
}
