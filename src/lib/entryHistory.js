// Earlier versions of an entry. They live on the entry itself (as
// `history`), so they are encrypted with the passcode, included in backups
// and exports, synced to other devices, and deleted with the entry.
//
// Only the writing is kept (not photos or voice memos, which are large and
// rarely what you are looking for), newest first, and only a limited
// number, so an entry never grows without bound.

export const MAX_VERSIONS = 10;
export const MAX_HISTORY_CHARS = 60000;
// Edits this close together count as one sitting: only the first earlier
// version is kept, not one per save (ticking checklist items, small fixes).
export const SAME_SITTING_MS = 5 * 60 * 1000;

// The fields that make up "what you wrote".
const TEXT_FIELDS = ['content', 'mood', 'tags', 'font', 'date', 'locationName', 'habits'];

export const SOURCE_LABELS = {
  edit: 'Edited on this device',
  sync: 'Replaced by a newer version from another device',
  conflict: 'Edited on another device at the same time',
};

function pick(entry) {
  const out = {};
  for (const field of TEXT_FIELDS) if (entry?.[field] !== undefined && entry[field] !== null) out[field] = entry[field];
  return out;
}

// The entry form saves "nothing" in different shapes than storage keeps it
// (an empty list of tags, the default font, a date without seconds), and
// none of that is a change to the writing. So compare the meaning: empty
// things are equal to missing things, dates by the minute, habits in a
// fixed order.
function normalizedField(field, value) {
  if (value === undefined || value === null) return null;
  switch (field) {
    case 'content':
      return String(value).trim();
    case 'mood':
    case 'locationName':
      return String(value).trim() || null;
    case 'font':
      return value === 'default' || value === '' ? null : value;
    case 'tags': {
      const tags = (Array.isArray(value) ? value : []).map((t) => String(t).trim()).filter(Boolean);
      return tags.length ? tags : null;
    }
    case 'date': {
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? String(value) : Math.floor(time / 60000);
    }
    case 'habits': {
      const keys = Object.keys(value || {}).filter((k) => value[k] !== undefined && value[k] !== '' && value[k] !== null);
      return keys.length ? keys.sort().map((k) => [k, value[k]]) : null;
    }
    default:
      return value;
  }
}

// Stable text of the writing, for comparing two versions.
export function textKey(entry) {
  return JSON.stringify(TEXT_FIELDS.map((field) => normalizedField(field, entry?.[field])));
}

export function sameText(a, b) {
  return textKey(a) === textKey(b);
}

// `entry` as it was, to be stored: its writing, when it was last changed
// (`savedAt`), and why it was replaced (`source`).
export function snapshotOf(entry, source, fallbackTime) {
  return {
    ...pick(entry),
    savedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : fallbackTime,
    source,
  };
}

function size(version) {
  return (version.content || '').length;
}

function trim(history) {
  const kept = [];
  let chars = 0;
  for (const version of history.slice(0, MAX_VERSIONS)) {
    chars += size(version);
    // Always keep the newest, even if it alone is large.
    if (kept.length > 0 && chars > MAX_HISTORY_CHARS) break;
    kept.push(version);
  }
  return kept;
}

// Adds `version` to a history (newest first) unless the same writing from
// the same moment is already there.
export function addVersion(history = [], version) {
  const exists = history.some((v) => v.savedAt === version.savedAt && sameText(v, version));
  if (exists) return history;
  const next = [...history, version].sort((a, b) => b.savedAt - a.savedAt);
  return trim(next);
}

// The entry after an edit: `next` with `prev`'s writing added to its
// history when the writing changed. Returns `next` itself when nothing
// about the writing changed.
export function recordEdit(prev, next, now = Date.now()) {
  if (sameText(prev, next)) return next;
  const history = prev.history || [];
  const latest = history[0];
  // The same sitting: keep the version from before it started.
  if (latest && latest.source === 'edit' && now - (latest.replacedAt ?? 0) < SAME_SITTING_MS) {
    return { ...next, history: history.map((v, i) => (i === 0 ? { ...v, replacedAt: now } : v)) };
  }
  const version = { ...snapshotOf(prev, 'edit', now), replacedAt: now };
  return { ...next, history: addVersion(history, version) };
}

// Combines the histories of two copies of an entry, plus the version that
// lost (if any), without duplicates.
export function mergeHistories(a = [], b = [], extra = null) {
  let merged = a;
  for (const version of b) merged = addVersion(merged, version);
  if (extra) merged = addVersion(merged, extra);
  return merged;
}

export function sameHistory(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v.savedAt === b[i].savedAt && v.source === b[i].source && sameText(v, b[i]));
}

// --- Conflicts ---------------------------------------------------------------

export function hasConflict(entry) {
  return Boolean(entry?.conflict);
}

// The version that lost a clash between devices, to compare against.
export function conflictingVersion(entry) {
  return (entry?.history || []).find((v) => v.source === 'conflict') || null;
}

// The fields to save to bring a stored version back. A field the version
// did not have is cleared, so the entry really looks like that version.
export function versionFields(version) {
  return {
    content: version.content ?? '',
    ...(version.date ? { date: version.date } : {}),
    mood: version.mood,
    tags: version.tags,
    font: version.font,
    locationName: version.locationName,
    habits: version.habits,
  };
}

// What to save to settle a conflict. `how`:
//   keep   the version shown now stays
//   other  the other device's version replaces it
//   both   the other version is added below the current one
// Always clears the flag. Returns the fields to pass to updateEntry.
export function resolution(entry, how) {
  const other = conflictingVersion(entry);
  const base = { conflict: undefined };
  if (how === 'keep' || !other) return base;
  if (how === 'other') return { ...base, ...versionFields(other) };
  return {
    ...base,
    content: `${entry.content || ''}\n\n---\n\n${other.content || ''}`.trim(),
  };
}

// --- Comparing two versions ---------------------------------------------------

const MAX_DIFF_WORDS = 1500;

// A word-by-word comparison: [{ text, kind }] with kind 'same', 'added'
// (in `to` only) or 'removed' (in `from` only). Each changed stretch comes
// out as what was removed, then what replaced it. Null when the texts are
// too long to compare quickly.
export function diffWords(from = '', to = '') {
  // A word keeps the spaces after it; leading spaces are their own piece.
  const split = (text) => text.match(/^\s+|\S+\s*/g) || [];
  const a = split(from);
  const b = split(to);
  if (a.length > MAX_DIFF_WORDS || b.length > MAX_DIFF_WORDS) return null;
  const same = (x, y) => x.trim() === y.trim();

  // Longest common subsequence table.
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = same(a[i], b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const parts = [];
  let removed = '';
  let added = '';
  const push = (text, kind) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ text, kind });
  };
  const flush = () => {
    // A space after both the removed and the added words belongs outside
    // them, so only the words themselves are marked.
    const spaceAfter = (text) => /\s*$/.exec(text)[0];
    const shared = spaceAfter(removed) === spaceAfter(added) ? spaceAfter(added) : '';
    const trim = (text) => (shared && text.trim() ? text.slice(0, text.length - shared.length) : text);
    if (removed) push(trim(removed), 'removed');
    if (added) push(trim(added), 'added');
    if (shared && (removed.trim() || added.trim())) push(shared, 'same');
    removed = '';
    added = '';
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) {
      flush();
      push(b[j], 'same');
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      removed += a[i++];
    } else {
      added += b[j++];
    }
  }
  while (i < a.length) removed += a[i++];
  while (j < b.length) added += b[j++];
  flush();
  return parts;
}
