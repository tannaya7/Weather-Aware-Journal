import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearDraft as clearStoredDraft,
  eraseJournal,
  getLockInfo,
  loadDraft as loadStoredDraft,
  loadEntries,
  removePasscode,
  requestPersistentStorage,
  saveDraft as saveStoredDraft,
  saveEntries,
  setPasscode,
  unlock as unlockStorage,
} from '../lib/storage.js';
import { mergeImportedEntries } from '../lib/exportImport.js';

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

  // --- Passcode lock ---

  const unlock = useCallback(
    async (passcode) => {
      const key = await unlockStorage(passcode);
      const loaded = await loadEntries(key);
      keyRef.current = key;
      applyEntries(loaded);
      setStatus('ready');
      requestPersistentStorage();
    },
    [applyEntries],
  );

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
        await unlockStorage(currentPasscode);
        keyRef.current = await setPasscode(newPasscode, entriesRef.current);
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
        setStatus('ready');
      }),
    [enqueue, applyEntries],
  );

  // --- Drafts (encrypted alongside entries when the lock is on) ---

  const loadDraft = useCallback((draftId) => loadStoredDraft(draftId, keyRef.current), []);
  const saveDraft = useCallback(
    (draftId, value) => enqueue(() => saveStoredDraft(draftId, value, keyRef.current)),
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
    lockEnabled,
    unlock,
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
