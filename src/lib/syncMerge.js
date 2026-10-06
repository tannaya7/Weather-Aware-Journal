// Merging two copies of the journal (this device's and the synced one).
// Each entry has updatedAt; each delete leaves a tombstone { id: deletedAt }.
// For every id the newest change wins, and a delete wins over any edit made
// before it. Entries without updatedAt (made before sync existed) count as
// oldest.

function stamp(entry) {
  return typeof entry?.updatedAt === 'number' ? entry.updatedAt : 0;
}

export function mergeTombstones(a = {}, b = {}) {
  const merged = { ...a };
  for (const [id, at] of Object.entries(b)) merged[id] = Math.max(merged[id] || 0, at);
  return merged;
}

export function mergeJournals(local, remote) {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const byId = new Map();

  for (const entry of local.entries || []) byId.set(String(entry.id), entry);
  for (const entry of remote.entries || []) {
    const key = String(entry.id);
    const mine = byId.get(key);
    if (!mine || stamp(entry) > stamp(mine)) byId.set(key, entry);
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
