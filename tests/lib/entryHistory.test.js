import { describe, expect, it } from 'vitest';
import {
  MAX_HISTORY_CHARS,
  MAX_VERSIONS,
  SAME_SITTING_MS,
  addVersion,
  conflictingVersion,
  diffWords,
  hasConflict,
  mergeHistories,
  recordEdit,
  resolution,
  sameHistory,
  sameText,
  snapshotOf,
} from '../../src/lib/entryHistory.js';
import { mergeEntry, mergeJournals, sameEntries } from '../../src/lib/syncMerge.js';

const HOUR = 3600 * 1000;

function entry(overrides = {}) {
  return { id: 1, content: 'first draft', mood: 'Happy', date: '2026-10-01T10:00', updatedAt: 1000, ...overrides };
}

describe('sameText / snapshotOf', () => {
  it('compares the writing, not photos, weather, or timestamps', () => {
    const a = entry({ images: ['x'], temperature: '10°C', updatedAt: 5 });
    expect(sameText(a, entry({ images: [], temperature: '30°C', updatedAt: 99 }))).toBe(true);
    expect(sameText(a, entry({ content: 'changed' }))).toBe(false);
    expect(sameText(a, entry({ mood: 'Sad' }))).toBe(false);
    expect(sameText(a, entry({ tags: ['x'] }))).toBe(false);
    expect(sameText(entry({ tags: ['a', 'b'] }), entry({ tags: ['a', 'b'] }))).toBe(true);
  });

  it('keeps only the writing, with when it was last changed and why it was replaced', () => {
    const snap = snapshotOf(entry({ images: ['big'], audio: [{}], temperature: '1°C', tags: ['t'] }), 'edit', 7);
    expect(snap).toEqual({ content: 'first draft', mood: 'Happy', date: '2026-10-01T10:00', tags: ['t'], savedAt: 1000, source: 'edit' });
    expect(snapshotOf({ content: 'x' }, 'sync', 7).savedAt).toBe(7); // no updatedAt: fall back
  });
});

describe('recordEdit', () => {
  it('adds the earlier writing to history when the writing changes', () => {
    const prev = entry();
    const next = recordEdit(prev, { ...prev, content: 'second draft', updatedAt: 2000 }, 2000);
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({ content: 'first draft', savedAt: 1000, source: 'edit', replacedAt: 2000 });
    expect(next.content).toBe('second draft');
  });

  it('leaves history alone when nothing about the writing changed', () => {
    const prev = entry();
    const next = { ...prev, temperature: '12°C', updatedAt: 2000 };
    expect(recordEdit(prev, next, 2000)).toBe(next);
    expect(next.history).toBeUndefined();
  });

  it('treats edits in one sitting as one version', () => {
    let e = entry();
    let t = 10_000;
    e = recordEdit(e, { ...e, content: 'v2', updatedAt: t }, t);
    t += 60_000;
    e = recordEdit(e, { ...e, content: 'v3', updatedAt: t }, t);
    t += 60_000;
    e = recordEdit(e, { ...e, content: 'v4', updatedAt: t }, t);
    expect(e.history.map((v) => v.content)).toEqual(['first draft']);
    // A later sitting starts a new version.
    t += SAME_SITTING_MS + 1;
    e = recordEdit(e, { ...e, content: 'v5', updatedAt: t }, t);
    expect(e.history.map((v) => v.content)).toEqual(['v4', 'first draft']);
  });

  it('keeps only the most recent versions', () => {
    let e = entry({ content: 'v0' });
    for (let i = 1; i <= 15; i++) {
      const t = i * HOUR;
      e = recordEdit(e, { ...e, content: `v${i}`, updatedAt: t }, t);
    }
    expect(e.history).toHaveLength(MAX_VERSIONS);
    expect(e.history[0].content).toBe('v14');
    expect(e.history[MAX_VERSIONS - 1].content).toBe('v5');
  });

  it('stays within a size budget, but always keeps the newest version', () => {
    const big = 'x'.repeat(MAX_HISTORY_CHARS / 2 + 10);
    let e = entry({ content: big });
    for (let i = 1; i <= 4; i++) {
      const t = i * HOUR;
      e = recordEdit(e, { ...e, content: `${big}${i}`, updatedAt: t }, t);
    }
    expect(e.history.length).toBeLessThan(4);
    expect(e.history.length).toBeGreaterThanOrEqual(1);
    expect(e.history[0].content.startsWith(big)).toBe(true);
  });

  it('does not copy photos or voice memos into history', () => {
    const prev = entry({ images: ['data:image/png;base64,AAAA'], audio: [{ id: 1 }] });
    const next = recordEdit(prev, { ...prev, content: 'changed', updatedAt: 2000 }, 2000);
    expect(JSON.stringify(next.history)).not.toContain('AAAA');
    expect(next.history[0].audio).toBeUndefined();
  });
});

describe('addVersion / mergeHistories', () => {
  const v = (savedAt, content, source = 'edit') => ({ savedAt, content, source });

  it('keeps versions newest first and ignores a repeat of the same writing at the same time', () => {
    let h = addVersion([], v(1, 'a'));
    h = addVersion(h, v(3, 'c'));
    h = addVersion(h, v(2, 'b'));
    h = addVersion(h, v(2, 'b', 'sync'));
    expect(h.map((x) => x.content)).toEqual(['c', 'b', 'a']);
  });

  it('merges two histories without duplicates, and adds the losing version', () => {
    const a = [v(3, 'c'), v(1, 'a')];
    const b = [v(2, 'b'), v(1, 'a')];
    expect(mergeHistories(a, b, v(4, 'd', 'conflict')).map((x) => x.content)).toEqual(['d', 'c', 'b', 'a']);
    expect(mergeHistories(a, a)).toBe(a);
    expect(sameHistory(a, [...a])).toBe(true);
    expect(sameHistory(a, b)).toBe(false);
  });
});

describe('mergeEntry', () => {
  const NOW = 100 * HOUR;

  it('lets a newer copy win and keeps the replaced writing in history', () => {
    const local = entry({ content: 'mine', updatedAt: 1000 });
    const remote = entry({ content: 'theirs', updatedAt: 2000 });
    const merged = mergeEntry(local, remote, { lastSyncedAt: 5000, now: NOW });
    expect(merged.content).toBe('theirs');
    expect(merged.conflict).toBeUndefined(); // my edit predates the last sync
    expect(merged.history).toEqual([expect.objectContaining({ content: 'mine', source: 'sync', savedAt: 1000 })]);
  });

  it('flags a real clash: both edited since the last sync', () => {
    const local = entry({ content: 'mine', updatedAt: 6000 });
    const remote = entry({ content: 'theirs', updatedAt: 7000 });
    const merged = mergeEntry(local, remote, { lastSyncedAt: 5000, now: NOW });
    expect(merged.content).toBe('theirs');
    expect(hasConflict(merged)).toBe(true);
    expect(merged.conflict).toEqual({ at: NOW, otherSavedAt: 6000 });
    expect(conflictingVersion(merged)).toMatchObject({ content: 'mine', source: 'conflict' });
  });

  it('does not flag when the first sync has nothing to compare against', () => {
    const merged = mergeEntry(entry({ content: 'a', updatedAt: 6000 }), entry({ content: 'b', updatedAt: 7000 }), { lastSyncedAt: null, now: NOW });
    expect(hasConflict(merged)).toBe(false);
    expect(merged.history[0].source).toBe('sync');
  });

  it('returns the very same object when the copies agree, so nothing needs saving', () => {
    const local = entry();
    const remote = JSON.parse(JSON.stringify(local));
    expect(mergeEntry(local, remote, { lastSyncedAt: 5000 })).toBe(local);
    expect(mergeEntry(local, local)).toBe(local);
  });

  it('only changes the writing-neutral parts (like weather) without recording history', () => {
    const local = entry({ updatedAt: 1000 });
    const remote = { ...local, updatedAt: 2000, temperature: '9°C' };
    const merged = mergeEntry(local, remote, { lastSyncedAt: 5000 });
    expect(merged).toBe(remote);
    expect(merged.history).toBeUndefined();
  });

  it('picks the same winner on both devices when timestamps tie but the writing differs', () => {
    const a = entry({ content: 'alpha', updatedAt: 3000 });
    const b = entry({ content: 'beta', updatedAt: 3000 });
    const onA = mergeEntry(a, b, { lastSyncedAt: 1000, now: NOW });
    const onB = mergeEntry(b, a, { lastSyncedAt: 1000, now: NOW });
    expect(onA.content).toBe(onB.content);
    expect(onA.history.map((v) => v.content)).toEqual(onB.history.map((v) => v.content));
  });

  it('carries a conflict flag raised on one side when the timestamps are equal', () => {
    const local = entry({ updatedAt: 3000 });
    const remote = { ...local, conflict: { at: 1, otherSavedAt: 2000 }, history: [{ savedAt: 2000, content: 'other', source: 'conflict' }] };
    const merged = mergeEntry(local, remote, { lastSyncedAt: 1000 });
    expect(merged.conflict).toEqual(remote.conflict);
    expect(merged.history).toHaveLength(1);
  });

  it('a resolution (newer, no flag) clears the flag on a device that still has it', () => {
    const flagged = entry({ updatedAt: 3000, conflict: { at: 1, otherSavedAt: 2000 } });
    const resolved = { ...flagged, updatedAt: 4000, conflict: undefined };
    const merged = mergeEntry(flagged, resolved, { lastSyncedAt: 3500 });
    expect(merged.conflict).toBeUndefined();
    expect(merged.updatedAt).toBe(4000);
  });

  it('treats a legacy entry with no timestamp as oldest', () => {
    const legacy = { id: 1, content: 'old way', mood: 'Happy', date: '2026-10-01T10:00' };
    const merged = mergeEntry(legacy, entry({ content: 'edited', updatedAt: 2000 }), { lastSyncedAt: 1000, now: NOW });
    expect(merged.content).toBe('edited');
    expect(merged.history[0].content).toBe('old way');
    expect(hasConflict(merged)).toBe(false);
  });
});

describe('two devices converge', () => {
  const options = { lastSyncedAt: 5000, now: 99 * HOUR };
  const base = entry({ content: 'shared', updatedAt: 1000 });
  const sync = (device, server) => {
    const merged = mergeJournals(device, server, options);
    return { device: merged, server: mergeJournals(server, merged, options) };
  };
  const byId = (journal) => [...journal.entries].sort((x, y) => x.id - y.id);

  it('reach the same entries, histories, and flags, and then stay put', () => {
    // Both edited entry 1 since their last sync; A also wrote entry 2.
    let a = {
      entries: [{ ...base, content: 'edit from A', updatedAt: 6000 }, entry({ id: 2, content: 'only on A', updatedAt: 6500 })],
      tombstones: {},
    };
    let b = { entries: [{ ...base, content: 'edit from B', updatedAt: 7000 }], tombstones: {} };
    let server = { entries: [base], tombstones: {} };

    for (let round = 0; round < 3; round++) {
      ({ device: b, server } = sync(b, server));
      ({ device: a, server } = sync(a, server));
    }

    expect(JSON.stringify(byId(a))).toBe(JSON.stringify(byId(b)));
    expect(JSON.stringify(byId(a))).toBe(JSON.stringify(byId(server)));

    const one = byId(a).find((e) => e.id === 1);
    expect(one.content).toBe('edit from B'); // newest wins
    expect(hasConflict(one)).toBe(true);
    expect(one.history.map((h) => [h.content, h.source])).toEqual([
      ['edit from A', 'conflict'],
      ['shared', 'sync'],
    ]);
    expect(byId(a).map((e) => e.id)).toEqual([1, 2]);
  });

  it('hands back the very same objects once everything agrees, so nothing is rewritten', () => {
    let a = { entries: [{ ...base, content: 'edit from A', updatedAt: 6000 }], tombstones: {} };
    let b = { entries: [{ ...base, content: 'edit from B', updatedAt: 7000 }], tombstones: {} };
    let server = { entries: [base], tombstones: {} };
    for (let round = 0; round < 3; round++) {
      ({ device: b, server } = sync(b, server));
      ({ device: a, server } = sync(a, server));
    }
    // A further round, with a copy that went through the server as JSON.
    const fromServer = JSON.parse(JSON.stringify(server));
    expect(sameEntries(a.entries, mergeJournals(a, fromServer, options).entries)).toBe(true);
    expect(sameEntries(b.entries, mergeJournals(b, fromServer, options).entries)).toBe(true);
  });

  it('settling a clash on one device settles it on the other', () => {
    let a = { entries: [{ ...base, content: 'edit from A', updatedAt: 6000 }], tombstones: {} };
    let b = { entries: [{ ...base, content: 'edit from B', updatedAt: 7000 }], tombstones: {} };
    let server = { entries: [base], tombstones: {} };
    for (let round = 0; round < 2; round++) {
      ({ device: b, server } = sync(b, server));
      ({ device: a, server } = sync(a, server));
    }
    expect(hasConflict(a.entries[0])).toBe(true);

    // A chooses to keep the current version: the flag goes, with a new timestamp.
    a = { ...a, entries: [{ ...a.entries[0], ...resolution(a.entries[0], 'keep'), updatedAt: 8000 }] };
    ({ device: a, server } = sync(a, server));
    ({ device: b, server } = sync(b, server));
    expect(hasConflict(a.entries[0])).toBe(false);
    expect(hasConflict(b.entries[0])).toBe(false);
  });
});

describe('resolution', () => {
  const clashed = entry({
    content: 'current',
    updatedAt: 7000,
    conflict: { at: 1, otherSavedAt: 6000 },
    history: [{ content: 'other device', mood: 'Sad', savedAt: 6000, source: 'conflict' }],
  });

  it('keep: only clears the flag', () => {
    expect(resolution(clashed, 'keep')).toEqual({ conflict: undefined });
  });

  it('other: brings back the other device version of the writing', () => {
    expect(resolution(clashed, 'other')).toMatchObject({ conflict: undefined, content: 'other device', mood: 'Sad' });
  });

  it('both: puts the other version below the current one', () => {
    expect(resolution(clashed, 'both').content).toBe('current\n\n---\n\nother device');
  });

  it('just clears the flag when there is no other version to use', () => {
    expect(resolution(entry({ conflict: { at: 1 } }), 'other')).toEqual({ conflict: undefined });
  });
});

describe('diffWords', () => {
  const text = (parts, kind) => parts.filter((p) => p.kind === kind).map((p) => p.text).join('');

  it('marks what was added and removed', () => {
    const parts = diffWords('the cat sat down', 'the dog sat down today');
    expect(text(parts, 'removed')).toBe('cat');
    expect(parts.filter((p) => p.kind === 'added').map((p) => p.text)).toEqual(['dog', 'today']);
    expect(parts.filter((p) => p.kind === 'same').map((p) => p.text).join('')).toContain('the');
  });

  it('is all "same" for identical text, and handles empty sides', () => {
    expect(diffWords('a b c', 'a b c')).toEqual([{ text: 'a b c', kind: 'same' }]);
    expect(diffWords('', 'new')).toEqual([{ text: 'new', kind: 'added' }]);
    expect(diffWords('old', '')).toEqual([{ text: 'old', kind: 'removed' }]);
    expect(diffWords('', '')).toEqual([]);
  });

  it('rebuilds both texts from its parts', () => {
    const from = 'one two three four five';
    const to = 'one 2 three four six seven';
    const parts = diffWords(from, to);
    expect(parts.filter((p) => p.kind !== 'added').map((p) => p.text).join('')).toBe(from);
    expect(parts.filter((p) => p.kind !== 'removed').map((p) => p.text).join('')).toBe(to);
  });

  it('gives up on very long texts instead of freezing', () => {
    const long = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
    expect(diffWords(long, `${long} more`)).toBeNull();
  });
});

describe('what counts as a change to the writing', () => {
  const base = entry({ tags: [], font: undefined, locationName: undefined, habits: undefined });

  it('ignores the different ways of saying nothing', () => {
    expect(sameText(base, entry({ tags: undefined, font: 'default', locationName: '', habits: {}, mood: 'Happy' }))).toBe(true);
    expect(sameText(entry({ mood: undefined }), entry({ mood: '' }))).toBe(true);
    expect(sameText(entry({ tags: [' ', ''] }), entry({ tags: [] }))).toBe(true);
    expect(sameText(entry({ habits: { sleep: '', run: undefined } }), entry({ habits: undefined }))).toBe(true);
  });

  it('ignores spaces around the text and seconds in the date', () => {
    expect(sameText(entry({ content: '  hello  ' }), entry({ content: 'hello' }))).toBe(true);
    expect(sameText(entry({ date: '2026-10-01T10:00' }), entry({ date: new Date('2026-10-01T10:00').toISOString() }))).toBe(true);
    expect(sameText(entry({ date: '2026-10-01T10:00:45' }), entry({ date: '2026-10-01T10:00' }))).toBe(true);
    expect(sameText(entry({ date: '2026-10-01T10:00' }), entry({ date: '2026-10-01T10:01' }))).toBe(false);
  });

  it('still sees real changes', () => {
    expect(sameText(entry({ tags: ['a'] }), entry({ tags: ['b'] }))).toBe(false);
    expect(sameText(entry({ font: 'serif' }), entry({ font: undefined }))).toBe(false);
    expect(sameText(entry({ habits: { sleep: 7 } }), entry({ habits: { sleep: 8 } }))).toBe(false);
    expect(sameText(entry({ habits: { a: 1, b: 2 } }), entry({ habits: { b: 2, a: 1 } }))).toBe(true);
    expect(sameText(entry({ locationName: 'Oslo' }), entry({ locationName: 'Rome' }))).toBe(false);
  });

  it('saving an entry unchanged records nothing', () => {
    const stored = entry({ updatedAt: 1000 });
    const formData = { content: stored.content, mood: 'Happy', date: '2026-10-01T10:00', tags: [], habits: undefined, font: 'default', locationName: undefined };
    const next = { ...stored, ...formData, updatedAt: 2000 };
    expect(recordEdit(stored, next, 2000)).toBe(next);
    expect(next.history).toBeUndefined();
  });
});

describe('diffWords grouping', () => {
  it('shows each changed stretch as removed, then added', () => {
    expect(diffWords('Walked to the park alone', 'Walked to the lake with Sam')).toEqual([
      { text: 'Walked to the ', kind: 'same' },
      { text: 'park alone', kind: 'removed' },
      { text: 'lake with Sam', kind: 'added' },
    ]);
  });

  it('keeps unchanged words together in the middle', () => {
    const parts = diffWords('I like red apples a lot', 'I like green apples a lot');
    expect(parts.map((p) => [p.kind, p.text.trim()])).toEqual([
      ['same', 'I like'],
      ['removed', 'red'],
      ['added', 'green'],
      ['same', 'apples a lot'],
    ]);
  });
});
