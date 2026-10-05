import { PBKDF2_ITERATIONS, decryptJson, deriveKey, encryptJson, randomBytes } from './crypto.js';

// Journal storage lives in IndexedDB: one record per entry, so saving only
// writes what changed, and the quota is far larger than localStorage's ~5MB
// (photos used to fill that quickly). When a passcode lock is on, each
// record holds { id, iv, data } with the entry encrypted (see crypto.js).

const DB_NAME = 'weatherJournal';
const DB_VERSION = 1;
const ENTRIES = 'entries';
const META = 'meta';
const LOCK_KEY = 'lock';
const LOCK_CHECK = 'weather-journal';

// Where entries lived before IndexedDB. Moved over once, on first load.
const LEGACY_KEY = 'weatherJournalEntries';

export class StorageFullError extends Error {
  constructor() {
    super(
      "Your device is out of storage space for the journal, so this wasn't saved. Try removing a photo, or free up some space on this device.",
    );
    this.name = 'StorageFullError';
  }
}

export class WrongPasscodeError extends Error {
  constructor() {
    super("That passcode isn't right.");
    this.name = 'WrongPasscodeError';
  }
}

function isQuotaError(error) {
  return (
    error?.name === 'QuotaExceededError' ||
    error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

function toStorageError(error) {
  return isQuotaError(error) ? new StorageFullError() : error;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRIES)) db.createObjectStore(ENTRIES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs `work(stores)` in one transaction and resolves once it commits, so a
// batch of writes lands all together or not at all.
async function transact(storeNames, mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const stores = Object.fromEntries(storeNames.map((name) => [name, tx.objectStore(name)]));
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(toStorageError(tx.error));
      tx.onabort = () => reject(toStorageError(tx.error) || new Error('Saving was cancelled.'));
      try {
        result = work(stores);
      } catch (error) {
        tx.abort();
        reject(toStorageError(error));
      }
    });
  } finally {
    db.close();
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

function readLegacyEntries() {
  let raw;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('Failed to parse entries', e);
    return [];
  }
}

// Moves entries saved by older versions of the app out of localStorage. The
// old copy is only removed after IndexedDB has the entries.
async function migrateLegacyEntries() {
  const legacy = readLegacyEntries();
  if (legacy.length === 0) return [];

  const { entries } = ensureIDs(legacy);
  await transact([ENTRIES], 'readwrite', ({ entries: store }) => {
    for (const entry of entries) store.put(entry);
  });
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Harmless: next load finds entries in IndexedDB and skips migration.
  }
  return entries;
}

export async function getLockInfo() {
  const db = await openDb();
  try {
    const tx = db.transaction(META, 'readonly');
    return (await promisify(tx.objectStore(META).get(LOCK_KEY))) || null;
  } finally {
    db.close();
  }
}

// Loads every entry. With a lock on, `key` must be the unlocked key.
export async function loadEntries(key = null) {
  const db = await openDb();
  let records;
  try {
    const tx = db.transaction(ENTRIES, 'readonly');
    records = await promisify(tx.objectStore(ENTRIES).getAll());
  } finally {
    db.close();
  }

  // Records come back sorted by id, and ids come from Date.now() at
  // creation, so this is creation order for everything the app made itself.
  if (records.length === 0 && !key) return migrateLegacyEntries();
  if (!key) return records;
  return Promise.all(records.map((record) => decryptJson(key, record)));
}

async function toRecord(entry, key) {
  if (!key) return entry;
  return { id: entry.id, ...(await encryptJson(key, entry)) };
}

// Writes the difference between `prev` and `next`: entries that are new or
// changed (a different object) are put, and missing ones are deleted.
export async function saveEntries(next, prev = [], key = null) {
  const prevById = new Map(prev.map((entry) => [entry.id, entry]));
  const nextIds = new Set(next.map((entry) => entry.id));
  const changed = next.filter((entry) => prevById.get(entry.id) !== entry);
  const removed = prev.filter((entry) => !nextIds.has(entry.id)).map((entry) => entry.id);

  // Encrypt before opening the transaction: IndexedDB transactions close
  // as soon as they're left idle across an await.
  const records = await Promise.all(changed.map((entry) => toRecord(entry, key)));

  await transact([ENTRIES], 'readwrite', ({ entries: store }) => {
    for (const record of records) store.put(record);
    for (const id of removed) store.delete(id);
  });
}

// Rewrites every entry (encrypted with `key`, or plain when key is null)
// and the lock record in one transaction, so turning the lock on or off, or
// changing the passcode, can't leave a mix of old and new records behind.
// Drafts are dropped too, so none is left behind unencrypted or under an
// old passcode.
async function rewriteAll(entries, key, lockRecord) {
  const records = await Promise.all(entries.map((entry) => toRecord(entry, key)));
  await transact([ENTRIES, META], 'readwrite', ({ entries: store, meta }) => {
    store.clear();
    meta.clear();
    for (const record of records) store.put(record);
    if (lockRecord) meta.put(lockRecord);
  });
}

async function makeLock(passcode) {
  const salt = randomBytes(16);
  const key = await deriveKey(passcode, salt, PBKDF2_ITERATIONS);
  const check = await encryptJson(key, LOCK_CHECK);
  return { key, record: { key: LOCK_KEY, salt, iterations: PBKDF2_ITERATIONS, check } };
}

// Turns the lock on (or changes the passcode) and returns the new key.
export async function setPasscode(passcode, entries) {
  const { key, record } = await makeLock(passcode);
  await rewriteAll(entries, key, record);
  return key;
}

export async function removePasscode(entries) {
  await rewriteAll(entries, null, null);
}

// Returns the key for `passcode`, or throws WrongPasscodeError.
export async function unlock(passcode) {
  const lock = await getLockInfo();
  if (!lock) throw new Error('The journal is not locked.');

  const key = await deriveKey(passcode, lock.salt, lock.iterations);
  try {
    if ((await decryptJson(key, lock.check)) === LOCK_CHECK) return key;
  } catch {
    // Wrong key: AES-GCM authentication fails.
  }
  throw new WrongPasscodeError();
}

// For a forgotten passcode: the only way back in is to start over.
export async function eraseJournal() {
  await transact([ENTRIES, META], 'readwrite', ({ entries, meta }) => {
    entries.clear();
    meta.clear();
  });
}

// Drafts share the meta store, and are encrypted too when the lock is on.
export async function loadDraft(draftId, key = null) {
  const db = await openDb();
  let record;
  try {
    const tx = db.transaction(META, 'readonly');
    record = await promisify(tx.objectStore(META).get(`draft:${draftId}`));
  } finally {
    db.close();
  }
  if (!record) return null;
  if (!key) return record.value ?? null;
  try {
    return await decryptJson(key, record);
  } catch {
    return null;
  }
}

export async function saveDraft(draftId, value, key = null) {
  const record = key
    ? { key: `draft:${draftId}`, ...(await encryptJson(key, value)) }
    : { key: `draft:${draftId}`, value };
  await transact([META], 'readwrite', ({ meta }) => meta.put(record));
}

export async function clearDraft(draftId) {
  await transact([META], 'readwrite', ({ meta }) => meta.delete(`draft:${draftId}`));
}

// Asks the browser not to clear the journal when the device runs low on
// space. Best effort: some browsers decide on their own.
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
