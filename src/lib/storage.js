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

export function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
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
