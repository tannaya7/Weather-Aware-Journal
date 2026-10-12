// Merging two copies of the journal (this device's and the synced one).
// Each entry has updatedAt; each delete leaves a tombstone { id: deletedAt }.
// For every id the newest change wins, and a delete wins over any edit made
// before it. Entries without updatedAt (made before sync existed) count as
// oldest.
//
// Nothing written is thrown away by a merge: the version that loses goes
// into the winner's history. If both devices edited the same entry since
// this device last synced, that is a real clash, and the entry is also
// flagged (`conflict`) so the person can look at both versions.
import { mergeHistories, sameHistory, sameText, snapshotOf, textKey } from './entryHistory.js';

function stamp(entry) {
  return typeof entry?.updatedAt === 'number' ? entry.updatedAt : 0;
}

export function mergeTombstones(a = {}, b = {}) {
  const merged = { ...a };
  for (const [id, at] of Object.entries(b)) merged[id] = Math.max(merged[id] || 0, at);
  return merged;
}

// One entry that exists on both sides. Returns one of the two objects
// untouched when the merge adds nothing, so a stable journal stays stable.
export function mergeEntry(local, remote, { lastSyncedAt = null, now = Date.now() } = {}) {
  if (local === remote) return local;
  const sl = stamp(local);
  const sr = stamp(remote);

  let winner;
  let loser;
  if (sr > sl) [winner, loser] = [remote, local];
  else if (sl > sr) [winner, loser] = [local, remote];
  else if (sameText(local, remote)) [winner, loser] = [local, remote];
  // Different writing with the exact same timestamp: both devices must
  // pick the same one, so go by the text itself.
  else if (textKey(remote) > textKey(local)) [winner, loser] = [remote, local];
  else [winner, loser] = [local, remote];

  let result = winner;
  let history = winner.history || [];
  let conflict = winner.conflict;

  if (!sameText(winner, loser)) {
    const clash = lastSyncedAt !== null && stamp(winner) > lastSyncedAt && stamp(loser) > lastSyncedAt;
    history = mergeHistories(history, loser.history, snapshotOf(loser, clash ? 'conflict' : 'sync', now));
    if (clash && !conflict) conflict = { at: now, otherSavedAt: stamp(loser) };
  } else {
    history = mergeHistories(history, loser.history);
    // The same moment on both sides: a flag raised on one side counts.
    if (sl === sr && !conflict) conflict = loser.conflict;
  }

  if (!sameHistory(history, winner.history || [])) result = { ...result, history };
  if (conflict !== winner.conflict) result = { ...result, conflict };
  return result;
}

export function mergeJournals(local, remote, options = {}) {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const byId = new Map();

  for (const entry of local.entries || []) byId.set(String(entry.id), entry);
  for (const entry of remote.entries || []) {
    const key = String(entry.id);
    const mine = byId.get(key);
    byId.set(key, mine ? mergeEntry(mine, entry, options) : entry);
  }

  const entries = [...byId.values()].filter((entry) => {
    const deletedAt = tombstones[String(entry.id)];
    return !deletedAt || stamp(entry) > deletedAt;
  });

  // Keep the local order for entries that were already here, then add new ones.
  const localOrder = new Map((local.entries || []).map((e, i) => [String(e.id), i]));
  entries.sort((a, b) => (localOrder.get(String(a.id)) ?? Infinity) - (localOrder.get(String(b.id)) ?? Infinity));

  return { entries, tombstones };
}

// Whether merging changed this device's list (so it needs saving locally).
export function sameEntries(a, b) {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((e) => [String(e.id), e]));
  return b.every((e) => byId.get(String(e.id)) === e);
}

function sameEntryValue(a, b) {
  if (a === b) return true;
  if (stamp(a) !== stamp(b)) return false;
  // No timestamp (from before sync): nothing to go by but the content.
  if (stamp(a) === 0) return JSON.stringify(a) === JSON.stringify(b);
  // Every edit changes the timestamp, so the same time means the same entry,
  // apart from what merging adds: its history and any clash flag.
  return sameHistory(a.history || [], b.history || []) && JSON.stringify(a.conflict ?? null) === JSON.stringify(b.conflict ?? null);
}

// Whether two journals hold the same thing (same entries, deletions, and
// habits), so a device whose merge changed nothing does not need to upload.
// Without this, every sync would bump the server version, and every other
// device would see that as news and sync too, forever.
export function sameJournal(a, b) {
  const ae = a.entries || [];
  const be = b.entries || [];
  if (ae.length !== be.length) return false;

  const byId = new Map(be.map((e) => [String(e.id), e]));
  for (const entry of ae) {
    const other = byId.get(String(entry.id));
    if (!other || !sameEntryValue(entry, other)) return false;
  }

  const ta = a.tombstones || {};
  const tb = b.tombstones || {};
  const keys = Object.keys(ta);
  if (keys.length !== Object.keys(tb).length || keys.some((k) => ta[k] !== tb[k])) return false;

  return JSON.stringify(a.habits ?? null) === JSON.stringify(b.habits ?? null);
}
