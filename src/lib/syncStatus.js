// The decisions behind live and offline syncing, kept apart from the hook
// so they can be tested without timers or a server.

// How often things happen. An object, not constants, so tests can shorten it.
export const SYNC_TIMING = {
  // Ask the server "has anything changed?" this often while the app is open.
  pollMs: 20_000,
  // Never check more often than this, whatever triggers it (focus, polling).
  minCheckGapMs: 3_000,
  // Wait before a change is uploaded, so typing is not a sync per keystroke.
  afterChangeMs: 4_000,
  // Waits between retries after a failure; the last one repeats.
  backoffMs: [5_000, 15_000, 45_000, 120_000, 300_000],
};

// How long to wait before retry number `attempt` (0 is the first retry).
// If the server asked for a longer wait, honor that.
export function retryDelay(attempt, retryAfterSeconds = null, timing = SYNC_TIMING) {
  const steps = timing.backoffMs;
  const base = steps[Math.min(attempt, steps.length - 1)];
  const asked = retryAfterSeconds ? retryAfterSeconds * 1000 : 0;
  return Math.max(base, asked);
}

// What to do about a failed sync, from the error's `code`:
//   offline   no connection: wait for it, retry when back
//   retry     the server had a problem or asked us to slow down: retry later
//   paused    needs the person (nothing will fix itself): stop and say why
export function classifyFailure(error) {
  switch (error?.code) {
    case 'network':
      return { kind: 'offline', message: error.message };
    case 'rate-limited':
    case 'server':
      return { kind: 'retry', message: error.message };
    case 'remote-deleted':
      return {
        kind: 'paused',
        message:
          'The synced copy was deleted from the server, maybe from another device. This device has paused syncing so it does not bring the journal back by itself.',
      };
    case 'too-large':
      return {
        kind: 'paused',
        message:
          'The journal is too big for the sync server (20 MB). Making photos smaller, in Settings under Storage, usually fixes it. Nothing is lost on this device.',
      };
    case 'wrong-code':
    case 'auth':
      return {
        kind: 'paused',
        message: 'This device’s sync code no longer matches the one on the server. Turn sync off here and join again with the right code.',
      };
    default:
      return { kind: 'retry', message: error?.message || 'Sync failed. Trying again soon.' };
  }
}

// How many changes on this device have not reached the server yet: entries
// edited after the last sync, and deletions made after it. Before the first
// sync, everything is waiting.
export function pendingChanges(entries, tombstones, lastSyncedAt) {
  if (lastSyncedAt === null || lastSyncedAt === undefined) {
    return entries.length + Object.keys(tombstones || {}).length;
  }
  let count = 0;
  for (const entry of entries) {
    // Entries from before sync existed have no time: treat them as old.
    if (typeof entry.updatedAt === 'number' && entry.updatedAt > lastSyncedAt) count++;
  }
  for (const deletedAt of Object.values(tombstones || {})) if (deletedAt > lastSyncedAt) count++;
  return count;
}

// Whether the server's version differs from the one this device last synced.
export function hasRemoteChanges(remoteVersion, knownVersion) {
  return Number.isInteger(remoteVersion) && remoteVersion !== (knownVersion ?? 0);
}

function changes(n) {
  return `${n} ${n === 1 ? 'change' : 'changes'}`;
}

// A plain sentence for where syncing stands right now. `sync` is what
// useSync returns; `formatTime` turns a timestamp into text.
export function describeSync(sync, formatTime) {
  switch (sync.status) {
    case 'syncing':
      return 'Syncing…';
    case 'paused':
      return `Sync is paused. ${sync.error}`;
    case 'offline':
      return sync.pending > 0
        ? `Offline. ${changes(sync.pending)} saved on this device will sync when you are back online.`
        : 'Offline. Everything is saved on this device and will sync when you are back online.';
    case 'error':
      return `Sync problem: ${sync.error} Trying again soon.${sync.pending > 0 ? ` ${changes(sync.pending)} waiting.` : ''}`;
    default: {
      const base = sync.lastSyncedAt ? `Synced · last ${formatTime(sync.lastSyncedAt)}` : 'Not synced yet';
      return sync.pending > 0 ? `${base} · ${changes(sync.pending)} waiting to sync` : base;
    }
  }
}
