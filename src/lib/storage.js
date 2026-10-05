// Key used for local storage - kept identical to the pre-upgrade app so existing
// journal entries survive the upgrade.
const STORAGE_KEY = 'weatherJournalEntries';

export function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('Failed to parse entries', e);
    return [];
  }
}

export class StorageFullError extends Error {
  constructor() {
    super(
      "Your journal is out of storage space, so this wasn't saved. Try removing a photo, or export your entries and delete some old ones.",
    );
    this.name = 'StorageFullError';
  }
}

function isQuotaError(error) {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  );
}

// Throws StorageFullError (instead of the browser's cryptic quota error) when
// localStorage is full — photos make that reachable in practice.
export function saveEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError();
    throw error;
  }
}

export function ensureIDs(entries) {
  let hasChanges = false;
  const withIds = entries.map((entry) => {
    if (entry.id) return entry;
    hasChanges = true;
    return { ...entry, id: Date.now() + Math.random() };
  });
  return { entries: withIds, hasChanges };
}
