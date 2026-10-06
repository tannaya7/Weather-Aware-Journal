import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SyncError,
  deleteSyncedJournal,
  getServerUrl,
  isValidSyncCode,
  newSyncCode,
  normalizeSyncCode,
  syncJournal,
} from '../lib/syncClient.js';
import { mergeJournals, sameEntries } from '../lib/syncMerge.js';

const AFTER_CHANGE_MS = 4000;

// Keeps this device's journal in step with the sync server: syncs when the
// journal opens, a few seconds after each change, and when the connection
// comes back. `base` is useEntries()'s API.
export function useSync(base, ready) {
  const baseRef = useRef(base);
  baseRef.current = base;
  const syncSetting = base.settings.sync;
  const enabled = Boolean(syncSetting?.code);

  const [state, setState] = useState({ status: 'idle', error: '' });
  const runningRef = useRef(null);
  const againRef = useRef(false);
  // Set when enabling/joining runs its own first sync, so the "just
  // enabled" effect below doesn't start a second one.
  const skipAutoRef = useRef(false);

  const syncNow = useCallback(async () => {
    // One sync at a time; a request during a sync runs once more after it.
    if (runningRef.current) {
      againRef.current = true;
      return runningRef.current;
    }
    const run = (async () => {
      const b = baseRef.current;
      const current = b.getSettingsNow().sync;
      if (!current?.code || !getServerUrl()) return;
      setState({ status: 'syncing', error: '' });
      try {
        const settings = b.getSettingsNow();
        const result = await syncJournal({
          code: current.code,
          local: { entries: b.getEntriesNow(), tombstones: settings.tombstones || {}, habits: settings.habits },
        });

        // Changes made while syncing are merged in, not overwritten; they
        // go up on the next round.
        const latest = mergeJournals(
          { entries: b.getEntriesNow(), tombstones: b.getSettingsNow().tombstones || {} },
          result,
        );
        if (!sameEntries(b.getEntriesNow(), latest.entries)) await b.replaceAll(latest.entries);
        await b.setSetting('tombstones', latest.tombstones);
        if (result.habits && !b.getSettingsNow().habits) await b.setSetting('habits', result.habits);
        await b.setSetting('sync', { ...current, version: result.version, lastSyncedAt: result.syncedAt });
        setState({ status: 'idle', error: '' });
      } catch (err) {
        setState({ status: 'error', error: err instanceof SyncError ? err.message : 'Sync failed. Try again later.' });
        if (!(err instanceof SyncError)) console.error(err);
      }
    })();
    runningRef.current = run;
    try {
      await run;
    } finally {
      runningRef.current = null;
      if (againRef.current) {
        againRef.current = false;
        syncNow();
      }
    }
  }, []);

  // Sync on open, and when the connection comes back.
  useEffect(() => {
    if (!ready || !enabled) return undefined;
    if (skipAutoRef.current) skipAutoRef.current = false;
    else syncNow();
    const online = () => syncNow();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [ready, enabled, syncNow]);

  // And a few seconds after each change.
  const firstEntries = useRef(true);
  useEffect(() => {
    if (firstEntries.current) {
      firstEntries.current = false;
      return undefined;
    }
    if (!ready || !enabled) return undefined;
    const timer = setTimeout(syncNow, AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [base.entries, ready, enabled, syncNow]);

  const enableSync = useCallback(async () => {
    skipAutoRef.current = true;
    await baseRef.current.setSetting('sync', { code: newSyncCode(), version: 0, lastSyncedAt: null });
    await syncNow();
  }, [syncNow]);

  const joinSync = useCallback(
    async (code) => {
      if (!isValidSyncCode(code)) throw new SyncError("That doesn't look like a sync code. Check for typos.");
      skipAutoRef.current = true;
      await baseRef.current.setSetting('sync', { code: normalizeSyncCode(code), version: 0, lastSyncedAt: null });
      await syncNow();
    },
    [syncNow],
  );

  // Stops syncing on this device; entries here are kept. With
  // deleteFromServer, the server copy (and reminders) are removed too.
  const disableSync = useCallback(async ({ deleteFromServer = false } = {}) => {
    const current = baseRef.current.getSettingsNow().sync;
    if (deleteFromServer && current?.code) await deleteSyncedJournal(current.code);
    await baseRef.current.setSetting('sync', null);
    setState({ status: 'idle', error: '' });
  }, []);

  return {
    available: Boolean(getServerUrl()),
    enabled,
    code: syncSetting?.code || null,
    lastSyncedAt: syncSetting?.lastSyncedAt || null,
    status: state.status,
    error: state.error,
    syncNow,
    enableSync,
    joinSync,
    disableSync,
  };
}
