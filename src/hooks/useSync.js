import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SyncError,
  checkVersion,
  deleteSyncedJournal,
  getServerUrl,
  isValidSyncCode,
  newSyncCode,
  normalizeSyncCode,
  syncJournal,
} from '../lib/syncClient.js';
import { mergeJournals, sameEntries } from '../lib/syncMerge.js';
import { SYNC_TIMING, classifyFailure, hasRemoteChanges, pendingChanges, retryDelay } from '../lib/syncStatus.js';

const IDLE = { status: 'idle', error: '', code: null, nextRetryAt: null };

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

// Keeps this device's journal in step with the sync server:
//   - when the journal opens and when the connection comes back,
//   - a few seconds after each change,
//   - whenever the server has something new (a small check every few
//     seconds while the app is open and visible, and the moment you come
//     back to it),
//   - and again after a failure, waiting a little longer each time.
// Some failures cannot fix themselves (the server copy was deleted, the
// code no longer matches): those pause syncing and say why, instead of
// retrying or quietly undoing what someone chose on another device.
// `base` is useEntries()'s API.
export function useSync(base, ready) {
  const baseRef = useRef(base);
  baseRef.current = base;
  const syncSetting = base.settings.sync;
  const enabled = Boolean(syncSetting?.code);

  const [state, setState] = useState(IDLE);
  const [online, setOnline] = useState(isOnline);
  const runningRef = useRef(null);
  const againRef = useRef(false);
  const pausedRef = useRef(false);
  const attemptRef = useRef(0);
  const retryTimerRef = useRef(null);
  const lastCheckRef = useRef(0);
  // False once this hook is gone: a sync still in flight then stops short
  // instead of writing to storage nobody is watching.
  const aliveRef = useRef(true);
  // Set when enabling/joining runs its own first sync, so the "just
  // enabled" effect below doesn't start a second one.
  const skipAutoRef = useRef(false);

  const clearRetry = useCallback(() => {
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  // One sync at a time; a request during a sync runs once more after it.
  const runSync = useCallback(async () => {
    if (runningRef.current) {
      againRef.current = true;
      return runningRef.current;
    }
    const run = (async () => {
      const b = baseRef.current;
      const current = b.getSettingsNow().sync;
      if (!current?.code || !getServerUrl()) return;
      clearRetry();
      setState({ status: 'syncing', error: '', code: null, nextRetryAt: null });
      try {
        const settings = b.getSettingsNow();
        const result = await syncJournal({
          code: current.code,
          lastSyncedAt: current.lastSyncedAt ?? null,
          knownVersion: current.version ?? 0,
          local: { entries: b.getEntriesNow(), tombstones: settings.tombstones || {}, habits: settings.habits },
        });
        if (!aliveRef.current) return;

        // Changes made while syncing are merged in, not overwritten; they
        // go up on the next round. (No clash check here: an edit made on this
        // device during the sync is not a clash with another device.)
        const latest = mergeJournals(
          { entries: b.getEntriesNow(), tombstones: b.getSettingsNow().tombstones || {} },
          result,
        );
        if (!sameEntries(b.getEntriesNow(), latest.entries)) await b.replaceAll(latest.entries);
        if (!aliveRef.current) return;
        await b.setSetting('tombstones', latest.tombstones);
        if (!aliveRef.current) return;
        if (result.habits && !b.getSettingsNow().habits) await b.setSetting('habits', result.habits);
        if (!aliveRef.current) return;
        // Sync may have been turned off while this ran: do not turn it back
        // on. Decided inside the write queue, so a turn-off that is queued
        // but not yet applied is seen too.
        await b.updateSetting('sync', (now) =>
          now?.code === current.code ? { ...now, version: result.version, lastSyncedAt: result.syncedAt } : now,
        );
        attemptRef.current = 0;
        pausedRef.current = false;
        setState(IDLE);
      } catch (err) {
        if (!aliveRef.current) return;
        if (!(err instanceof SyncError)) console.error(err);
        const failure = classifyFailure(err instanceof SyncError ? err : null);
        if (failure.kind === 'paused') {
          pausedRef.current = true;
          setState({ status: 'paused', error: failure.message, code: err.code, nextRetryAt: null });
          return;
        }
        const delay = retryDelay(attemptRef.current++, err instanceof SyncError ? err.retryAfter : null);
        setState({
          status: failure.kind === 'offline' ? 'offline' : 'error',
          error: failure.message,
          code: err.code ?? null,
          nextRetryAt: Date.now() + delay,
        });
        retryTimerRef.current = setTimeout(() => {
          if (!pausedRef.current) runSync();
        }, delay);
      }
    })();
    runningRef.current = run;
    try {
      await run;
    } finally {
      runningRef.current = null;
      if (againRef.current) {
        againRef.current = false;
        runSync();
      }
    }
  }, [clearRetry]);

  // For the automatic triggers: does nothing while paused.
  const autoSync = useCallback(() => {
    if (pausedRef.current) return undefined;
    return runSync();
  }, [runSync]);

  // The "Sync now" button: always tries, even when paused.
  const syncNow = useCallback(async () => {
    pausedRef.current = false;
    attemptRef.current = 0;
    return runSync();
  }, [runSync]);

  // Sync on open, and when the connection comes back or goes away.
  useEffect(() => {
    if (!ready || !enabled) return undefined;
    if (skipAutoRef.current) skipAutoRef.current = false;
    else autoSync();
    const handleOnline = () => {
      setOnline(true);
      attemptRef.current = 0;
      autoSync();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [ready, enabled, autoSync]);

  // Pick up changes made on other devices: a small check on a timer while
  // the app is open and visible, and as soon as you come back to it.
  useEffect(() => {
    if (!ready || !enabled) return undefined;
    async function check() {
      if (pausedRef.current || runningRef.current) return;
      if (document.visibilityState === 'hidden' || !isOnline()) return;
      const now = Date.now();
      if (now - lastCheckRef.current < SYNC_TIMING.minCheckGapMs) return;
      lastCheckRef.current = now;

      const current = baseRef.current.getSettingsNow().sync;
      if (!current?.code || !getServerUrl()) return;
      try {
        const remote = await checkVersion(current.code);
        // A sync may have started and finished while we waited for the
        // answer: compare with what this device knows now, not before.
        if (pausedRef.current || runningRef.current) return;
        const latest = baseRef.current.getSettingsNow().sync;
        if (latest?.code === current.code && hasRemoteChanges(remote, latest.version)) autoSync();
      } catch (err) {
        // A journal that is gone is dealt with by a real sync, which knows
        // what to say. Anything else (offline, busy) is for the next check.
        if (err.code === 'not-found' && (current.version ?? 0) > 0) autoSync();
      }
    }
    const interval = setInterval(check, SYNC_TIMING.pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, enabled, autoSync]);

  // And a few seconds after each change. Only a change to the entries
  // counts (not, say, sync being switched on), and the wait is not cut
  // short by anything else re-rendering.
  const seenEntriesRef = useRef(base.entries);
  const changeTimerRef = useRef(null);
  useEffect(() => {
    if (seenEntriesRef.current === base.entries) return;
    seenEntriesRef.current = base.entries;
    if (!ready || !enabled) return;
    clearTimeout(changeTimerRef.current);
    changeTimerRef.current = setTimeout(autoSync, SYNC_TIMING.afterChangeMs);
  }, [base.entries, ready, enabled, autoSync]);

  // Leaving: no stray retry afterwards.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearRetry();
      clearTimeout(changeTimerRef.current);
    };
  }, [clearRetry]);

  const enableSync = useCallback(async () => {
    skipAutoRef.current = true;
    pausedRef.current = false;
    await baseRef.current.setSetting('sync', { code: newSyncCode(), version: 0, lastSyncedAt: null });
    await runSync();
  }, [runSync]);

  const joinSync = useCallback(
    async (code) => {
      if (!isValidSyncCode(code)) throw new SyncError("That doesn't look like a sync code. Check for typos.");
      skipAutoRef.current = true;
      pausedRef.current = false;
      await baseRef.current.setSetting('sync', { code: normalizeSyncCode(code), version: 0, lastSyncedAt: null });
      await runSync();
    },
    [runSync],
  );

  // After the server copy was deleted: choose to put this device's journal
  // back there (and share it from here again).
  const uploadAgain = useCallback(async () => {
    const current = baseRef.current.getSettingsNow().sync;
    if (!current?.code) return;
    pausedRef.current = false;
    attemptRef.current = 0;
    await baseRef.current.setSetting('sync', { ...current, version: 0, lastSyncedAt: null });
    await runSync();
  }, [runSync]);

  // Stops syncing on this device; entries here are kept. With
  // deleteFromServer, the server copy (and reminders) are removed too.
  const disableSync = useCallback(
    async ({ deleteFromServer = false } = {}) => {
      const current = baseRef.current.getSettingsNow().sync;
      if (deleteFromServer && current?.code) await deleteSyncedJournal(current.code);
      clearRetry();
      pausedRef.current = false;
      attemptRef.current = 0;
      await baseRef.current.setSetting('sync', null);
      setState(IDLE);
    },
    [clearRetry],
  );

  const pending = useMemo(
    () => (enabled ? pendingChanges(base.entries, base.settings.tombstones, syncSetting?.lastSyncedAt ?? null) : 0),
    [enabled, base.entries, base.settings.tombstones, syncSetting?.lastSyncedAt],
  );

  // The entries that need a look because two devices edited them at once.
  const conflicts = useMemo(() => (enabled ? base.entries.filter((e) => e.conflict) : []), [enabled, base.entries]);

  return {
    available: Boolean(getServerUrl()),
    enabled,
    code: syncSetting?.code || null,
    lastSyncedAt: syncSetting?.lastSyncedAt || null,
    // idle | syncing | offline | error | paused
    status: state.status,
    error: state.error,
    errorCode: state.code,
    nextRetryAt: state.nextRetryAt,
    online,
    pending,
    conflicts,
    syncNow,
    uploadAgain,
    enableSync,
    joinSync,
    disableSync,
  };
}
