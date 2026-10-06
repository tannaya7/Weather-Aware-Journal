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
  loadSetting,
  requestPersistentStorage,
  saveSetting,
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
import { DEFAULT_HABIT_CONFIG } from '../lib/habits.js';

// Owns the journal entries array and every change to it, persisted to
// IndexedDB (lib/storage.js). Loading is async, so `status` moves from
// 'loading' to 'ready' — or to 'locked' when a passcode is set, until
// unlock() succeeds — or 'error' if storage can't be opened at all.
//
// Every write goes through one queue, so quick successive changes (delete
// then undo) apply in order, each on top of the last saved list. A write
// saves first and only then updates state, so a failed save (for example
// StorageFullError) rejects and leaves the list as it actually is on disk.
// Settings kept with the journal; they're re-saved whenever the lock
// changes (which clears and re-encrypts the meta store).
const SETTING_NAMES = ['habits', 'sync', 'tombstones', 'ai'];

async function loadAllSettings(key) {
  const values = await Promise.all(SETTING_NAMES.map((name) => loadSetting(name, key)));
  return Object.fromEntries(SETTING_NAMES.map((name, i) => [name, values[i]]).filter(([, v]) => v !== null));
}

async function saveAllSettings(values, key) {
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) await saveSetting(name, value, key);
  }
}

export function useEntries() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState('loading');
  const [lockEnabled, setLockEnabled] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  // Small settings saved with the journal (and encrypted with it): which
  // habits to track, sync details, deletion records for sync, AI opt-in.
  const [settings, setSettings] = useState({});
  const settingsRef = useRef({});
  const habitConfig = settings.habits || DEFAULT_HABIT_CONFIG;
  const [loadError, setLoadError] = useState(null);

  const entriesRef = useRef([]);
  const keyRef = useRef(null); // AES key while unlocked; never stored
  const queueRef = useRef(Promise.resolve());

  const applyEntries = useCallback((next) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const applySettings = useCallback((next) => {
    settingsRef.current = next;
    setSettings(next);
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
        const [loaded, stored] = await Promise.all([loadEntries(), loadAllSettings(null)]);
        if (cancelled) return;
        applyEntries(loaded);
        applySettings(stored);
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
  }, [applyEntries, applySettings]);

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

  // Deleted ids with when, so a delete on one device isn't undone by an
  // older copy synced from another (see lib/syncMerge.js).
  const writeTombstones = useCallback(async (update) => {
    const next = update({ ...(settingsRef.current.tombstones || {}) });
    await saveSetting('tombstones', next, keyRef.current);
    applySettings({ ...settingsRef.current, tombstones: next });
  }, [applySettings]);

  const addEntry = useCallback(
    (data) => {
      const entry = { id: Date.now() + Math.random(), ...data, updatedAt: Date.now() };
      return persist((prev) => ({ next: [...prev, entry], result: entry }));
    },
    [persist],
  );

  const updateEntry = useCallback(
    (id, data) =>
      persist((prev) => ({
        next: prev.map((e) => (e.id === id ? { ...e, ...data, id, updatedAt: Date.now() } : e)),
        result: undefined,
      })),
    [persist],
  );

  const deleteEntry = useCallback(
    async (id) => {
      const removed = await persist((prev) => ({
        next: prev.filter((e) => e.id !== id),
        result: prev.find((e) => e.id === id) || null,
      }));
      if (removed) {
        await enqueue(() => writeTombstones((t) => ({ ...t, [id]: Date.now() })));
      }
      return removed;
    },
    [persist, enqueue, writeTombstones],
  );

  const restoreEntry = useCallback(
    async (entry) => {
      if (!entry) return;
      await persist((prev) => ({ next: [...prev, { ...entry, updatedAt: Date.now() }], result: undefined }));
      await enqueue(() =>
        writeTombstones((t) => {
          delete t[entry.id];
          return t;
        }),
      );
    },
    [persist, enqueue, writeTombstones],
  );

  // Replaces the whole list (sync merges): diffs against what's stored.
  const replaceAll = useCallback(
    (next) => persist(() => ({ next, result: undefined })),
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
      const [loaded, stored] = await Promise.all([loadEntries(key), loadAllSettings(key)]);
      keyRef.current = key;
      applyEntries(loaded);
      applySettings(stored);
      setStatus('ready');
      requestPersistentStorage();
    },
    [applyEntries, applySettings],
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
        await saveAllSettings(settingsRef.current, keyRef.current);
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
        await saveAllSettings(settingsRef.current, null);
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
        applySettings({});
        setLockEnabled(false);
        setPasskeyEnabled(false);
        setStatus('ready');
      }),
    [enqueue, applyEntries, applySettings],
  );

  // Which habits to track (Settings). Saved with the journal, encrypted when
  // the lock is on, because custom habit names can be personal.
  const setSetting = useCallback(
    (name, value) =>
      enqueue(async () => {
        await saveSetting(name, value, keyRef.current);
        applySettings({ ...settingsRef.current, [name]: value });
      }),
    [enqueue, applySettings],
  );
  const setHabitConfig = useCallback((config) => setSetting('habits', config), [setSetting]);

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
    habitConfig,
    setHabitConfig,
    settings,
    setSetting,
    replaceAll,
    getEntriesNow: () => entriesRef.current,
    getSettingsNow: () => settingsRef.current,
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
