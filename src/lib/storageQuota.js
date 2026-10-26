import { getEntryImages } from './entryImages.js';

// How much room the journal has, and what is using it.

export const WARN_AT = 0.8;
export const CRITICAL_AT = 0.95;
// The sync server stores one journal up to this size (worker/src/vault.js).
export const SYNC_LIMIT_BYTES = 20 * 1024 * 1024;
// What goes to the server is JSON text, encrypted and then written in base64,
// which makes it about a third larger than the journal itself.
const SYNC_OVERHEAD = 4 / 3;

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

// The browser's own numbers for this site. `usage` includes everything the
// site stores (including cached app files and, if turned on, the search
// model), not only the journal.
export async function getStorageStatus(storage = typeof navigator === 'undefined' ? undefined : navigator.storage) {
  if (!storage?.estimate) return { supported: false };
  try {
    const { usage = 0, quota = 0 } = await storage.estimate();
    const persisted = typeof storage.persisted === 'function' ? await storage.persisted().catch(() => null) : null;
    const fraction = quota > 0 ? usage / quota : 0;
    return {
      supported: true,
      usage,
      quota,
      fraction,
      persisted,
      level: fraction >= CRITICAL_AT ? 'critical' : fraction >= WARN_AT ? 'warn' : 'ok',
    };
  } catch {
    return { supported: false };
  }
}

// Asks the browser to keep the journal when the device runs low on space.
// Resolves to whether it was granted (browsers may decide on their own).
export async function requestPersistence(storage = typeof navigator === 'undefined' ? undefined : navigator.storage) {
  if (!storage?.persist) return false;
  try {
    return Boolean(await storage.persist());
  } catch {
    return false;
  }
}

// Bytes a data URL takes when stored (the picture itself, not the text form).
export function dataUrlBytes(url) {
  if (typeof url !== 'string') return 0;
  const comma = url.indexOf(',');
  const body = comma >= 0 ? url.slice(comma + 1) : url;
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

function textBytes(entry) {
  let n = (entry.content || '').length + (entry.locationName || '').length + (entry.tags || []).join(',').length;
  for (const version of entry.history || []) n += (version.content || '').length;
  return n;
}

// What the entries add up to, split into writing, photos, and voice memos.
export function journalBreakdown(entries) {
  let text = 0;
  let photoBytes = 0;
  let photos = 0;
  let voiceBytes = 0;
  let voice = 0;
  for (const entry of entries) {
    text += textBytes(entry);
    for (const image of getEntryImages(entry)) {
      photos++;
      photoBytes += dataUrlBytes(image);
    }
    for (const memo of entry.audio || []) {
      voice++;
      voiceBytes += dataUrlBytes(memo.src);
    }
  }
  return { text, photos, photoBytes, voice, voiceBytes, total: text + photoBytes + voiceBytes };
}

// How the journal's size compares with what the sync server accepts.
export function syncSize(entries) {
  const { total } = journalBreakdown(entries);
  const estimated = Math.round(total * SYNC_OVERHEAD);
  const fraction = estimated / SYNC_LIMIT_BYTES;
  return {
    estimated,
    limit: SYNC_LIMIT_BYTES,
    fraction,
    level: fraction >= 1 ? 'over' : fraction >= 0.7 ? 'close' : 'ok',
  };
}
