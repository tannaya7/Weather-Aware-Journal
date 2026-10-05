import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addPasskey,
  changePasscode as rewrapPasscode,
  clearDraft as clearStoredDraft,
  eraseJournal,
  getLockInfo,
  loadDraft as loadStoredDraft,
  loadEntries,
  removePasskey,
  removePasscode,
  requestPersistentStorage,
  rescueDraft,
  saveDraft as saveStoredDraft,
  saveEntries,
  setPasscode,
  unlock as unlockStorage,
  unlockWithPasskeySecret,
} from '../lib/storage.js';
import { mergeEntries, mergeImportedEntries } from '../lib/exportImport.js';
import { readEncryptedBackup } from '../lib/backup.js';
import { getPasskeySecret, registerPasskey } from '../lib/passkey.js';

// Owns the journal entries array and every change to it, persisted to
// IndexedDB (lib/storage.js). Loading is async, so `status` moves from
// 'loading' to 'ready' — or to 'locked' when a passcode is set, until
// unlock() succeeds — or 'error' if storage can't be opened at all.
//
// Every write goes through one queue, so quick successive changes (delete
// then undo) apply in order, each on top of the last saved list. A write
// saves first and only then updates state, so a failed save (for example
// StorageFullError) rejects and leaves the list as it actually is on disk.
export function useEntries() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState('loading');
  const [lockEnabled, setLockEnabled] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const entriesRef = useRef([]);
  const keyRef = useRef(null); // AES key while unlocked; never stored
  const queueRef = useRef(Promise.resolve());

  const applyEntries = useCallback((next) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lock = await getLockInfo();
        if (cancelled) return;
        if (lock) {
          setLockEnabled(true);
          setPasskeyEnabled(Boolean(lock.passkey));
          setStatus('locked');
          return;
        }
        const loaded = await loadEntries();
        if (cancelled) return;
        applyEntries(loaded);
        setStatus('ready');
        requestPersistentStorage();
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setLoadError(error);
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyEntries]);

  const enqueue = useCallback((task) => {
    const run = queueRef.current.then(task);
    queueRef.current = run.catch(() => {});
    return run;
  }, []);

  // `compute(prev)` returns { next, result }; next is saved, result returned.
  const persist = useCallback(
    (compute) =>
      enqueue(async () => {
        const prev = entriesRef.current;
        const { next, result } = compute(prev);
        await saveEntries(next, prev, keyRef.current);
        applyEntries(next);
        return result;
      }),
    [enqueue, applyEntries],
  );

  const addEntry = useCallback(
    (data) => {
      const entry = { id: Date.now() + Math.random(), ...data };
      return persist((prev) => ({ next: [...prev, entry], result: entry }));
    },
    [persist],
  );

  const updateEntry = useCallback(
    (id, data) =>
      persist((prev) => ({
        next: prev.map((e) => (e.id === id ? { ...e, ...data, id } : e)),
        result: undefined,
      })),
    [persist],
  );

  const deleteEntry = useCallback(
    (id) =>
      persist((prev) => ({
        next: prev.filter((e) => e.id !== id),
        result: prev.find((e) => e.id === id) || null,
      })),
    [persist],
  );

  const restoreEntry = useCallback(
    (entry) => {
      if (!entry) return Promise.resolve();
      return persist((prev) => ({ next: [...prev, entry], result: undefined }));
    },
    [persist],
  );

  const getEntryById = useCallback((id) => entries.find((e) => String(e.id) === String(id)), [entries]);

  const importEntries = useCallback(
    (jsonText) =>
      persist((prev) => {
        const result = mergeImportedEntries(prev, jsonText);
        return { next: result.entries, result };
      }),
    [persist],
  );

  // Restores an encrypted backup file (lib/backup.js), merging its entries
  // the same way as a JSON import.
  const importBackup = useCallback(
    async (text, password) => {
      const backupEntries = await readEncryptedBackup(text, password);
      return persist((prev) => {
        const result = mergeEntries(prev, backupEntries);
        return { next: result.entries, result };
      });
    },
    [persist],
  );

  // --- Passcode lock ---

  const openWithKey = useCallback(
    async (key) => {
      const loaded = await loadEntries(key);
      keyRef.current = key;
      applyEntries(loaded);
      setStatus('ready');
      requestPersistentStorage();
    },
    [applyEntries],
  );

  const unlock = useCallback(
    async (passcode) => openWithKey(await unlockStorage(passcode)),
    [openWithKey],
  );

  // Fingerprint / face / device PIN, via the passkey's PRF secret.
  const unlockWithPasskey = useCallback(async () => {
    const lock = await getLockInfo();
    const secret = await getPasskeySecret(lock.passkey);
    await openWithKey(await unlockWithPasskeySecret(secret));
  }, [openWithKey]);

  const lock = useCallback(() => {
    if (!lockEnabled) return;
    enqueue(async () => {
      keyRef.current = null;
      applyEntries([]);
      setStatus('locked');
    });
  }, [lockEnabled, enqueue, applyEntries]);

  const enableLock = useCallback(
    (passcode) =>
      enqueue(async () => {
        keyRef.current = await setPasscode(passcode, entriesRef.current);
        setLockEnabled(true);
      }),
    [enqueue],
  );

  // Changing or removing the passcode asks for the current one, so someone
  // at an already-unlocked device can't take over the journal.
  const changePasscode = useCallback(
    (currentPasscode, newPasscode) =>
      enqueue(async () => {
        const key = await unlockStorage(currentPasscode);
        await rewrapPasscode(key, newPasscode);
      }),
    [enqueue],
  );

  // Adding a passkey also asks for the passcode first, for the same reason.
  const enablePasskey = useCallback(
    (currentPasscode) =>
      enqueue(async () => {
        const key = await unlockStorage(currentPasscode);
        await addPasskey(key, await registerPasskey());
        setPasskeyEnabled(true);
      }),
    [enqueue],
  );

  const disablePasskey = useCallback(
    () =>
      enqueue(async () => {
        await removePasskey();
        setPasskeyEnabled(false);
      }),
    [enqueue],
  );

  const disableLock = useCallback(
    (currentPasscode) =>
      enqueue(async () => {
        await unlockStorage(currentPasscode);
        await removePasscode(entriesRef.current);
        keyRef.current = null;
        setLockEnabled(false);
        setPasskeyEnabled(false);
      }),
    [enqueue],
  );

  const eraseAndStartOver = useCallback(
    () =>
      enqueue(async () => {
        await eraseJournal();
        keyRef.current = null;
        applyEntries([]);
        setLockEnabled(false);
        setPasskeyEnabled(false);
        setStatus('ready');
      }),
    [enqueue, applyEntries],
  );

  // --- Drafts (encrypted alongside entries when the lock is on) ---

  const loadDraft = useCallback((draftId) => loadStoredDraft(draftId, keyRef.current), []);
  // `urgent`: the page is closing or the form is going away, so also keep a
  // synchronous rescue copy (unlocked journals only; see storage.js).
  const saveDraft = useCallback(
    (draftId, value, { urgent = false } = {}) => {
      if (urgent && !keyRef.current) rescueDraft(draftId, value);
      return enqueue(() => saveStoredDraft(draftId, value, keyRef.current));
    },
    [enqueue],
  );
  const clearDraft = useCallback((draftId) => enqueue(() => clearStoredDraft(draftId)), [enqueue]);

  return {
    entries,
    status,
    loadError,
    addEntry,
    updateEntry,
    deleteEntry,
    restoreEntry,
    getEntryById,
    importEntries,
    importBackup,
    lockEnabled,
    passkeyEnabled,
    unlock,
    unlockWithPasskey,
    enablePasskey,
    disablePasskey,
    lock,
    enableLock,
    changePasscode,
    disableLock,
    eraseAndStartOver,
    loadDraft,
    saveDraft,
    clearDraft,
  };
}
