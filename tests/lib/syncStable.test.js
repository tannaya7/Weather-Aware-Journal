import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSyncCode, setServerUrl, syncJournal, checkVersion } from '../../src/lib/syncClient.js';
import { mergeJournals, sameJournal } from '../../src/lib/syncMerge.js';
import { handle } from '../../worker/src/index.js';

describe('sameJournal', () => {
  const e = (id, updatedAt, extra = {}) => ({ id, content: `c${id}`, updatedAt, ...extra });

  it('is true for the same entries even when they are different objects', () => {
    const a = { entries: [e(1, 100), e(2, 200)], tombstones: { 9: 50 }, habits: { enabled: ['sleep'] } };
    const b = JSON.parse(JSON.stringify(a));
    expect(sameJournal(a, b)).toBe(true);
    expect(sameJournal(a, { ...b, entries: [...b.entries].reverse() })).toBe(true); // order does not matter
  });

  it('is false when an entry, a deletion, or the habits differ', () => {
    const base = { entries: [e(1, 100)], tombstones: {}, habits: null };
    expect(sameJournal(base, { ...base, entries: [e(1, 101)] })).toBe(false);
    expect(sameJournal(base, { ...base, entries: [e(1, 100), e(2, 100)] })).toBe(false);
    expect(sameJournal(base, { ...base, entries: [e(2, 100)] })).toBe(false);
    expect(sameJournal(base, { ...base, tombstones: { 5: 1 } })).toBe(false);
    expect(sameJournal({ ...base, tombstones: { 5: 1 } }, { ...base, tombstones: { 5: 2 } })).toBe(false);
    expect(sameJournal(base, { ...base, habits: { enabled: [] } })).toBe(false);
  });

  it('notices merge additions at the same timestamp: history and clash flags', () => {
    const plain = e(1, 100);
    const withHistory = { ...plain, history: [{ savedAt: 50, content: 'old', source: 'sync' }] };
    const flagged = { ...plain, conflict: { at: 1, otherSavedAt: 50 } };
    expect(sameJournal({ entries: [plain] }, { entries: [withHistory] })).toBe(false);
    expect(sameJournal({ entries: [plain] }, { entries: [flagged] })).toBe(false);
    expect(sameJournal({ entries: [withHistory] }, { entries: [JSON.parse(JSON.stringify(withHistory))] })).toBe(true);
  });

  it('compares old entries without a timestamp by their content', () => {
    expect(sameJournal({ entries: [{ id: 1, content: 'a' }] }, { entries: [{ id: 1, content: 'a' }] })).toBe(true);
    expect(sameJournal({ entries: [{ id: 1, content: 'a' }] }, { entries: [{ id: 1, content: 'b' }] })).toBe(false);
  });

  it('treats a missing list like an empty one', () => {
    expect(sameJournal({}, { entries: [], tombstones: {}, habits: null })).toBe(true);
  });

  it('agrees with mergeJournals: merging a journal with a copy of itself changes nothing', () => {
    const j = { entries: [e(1, 100), e(2, 200, { history: [{ savedAt: 1, content: 'x', source: 'edit' }] })], tombstones: { 3: 10 } };
    const merged = mergeJournals(j, JSON.parse(JSON.stringify(j)), { lastSyncedAt: 5 });
    expect(sameJournal(merged, j)).toBe(true);
  });
});

describe('devices that sync repeatedly settle down', () => {
  beforeEach(() => setServerUrl('https://server.example'));
  afterEach(() => setServerUrl(null));

  function makeServer() {
    const store = new Map();
    let clock = Date.now();
    const env = {
      ALLOWED_ORIGINS: '',
      JOURNAL: {
        get: async (k, type) => (store.has(k) ? (type === 'json' ? JSON.parse(store.get(k)) : store.get(k)) : null),
        put: async (k, v) => store.set(k, v),
        delete: async (k) => store.delete(k),
        list: async () => ({ keys: [], list_complete: true }),
      },
    };
    const puts = [];
    const fetchImpl = (url, init) => {
      if (init?.method === 'PUT') puts.push(url);
      return handle(new Request(url, init), env, { now: () => (clock += 2000) });
    };
    return { fetchImpl, puts };
  }

  // A device the way the app uses it: remembers the version it last saw.
  function device(code, fetchImpl) {
    const d = { entries: [], tombstones: {}, version: 0, lastSyncedAt: null };
    d.sync = async () => {
      const result = await syncJournal({
        code,
        local: { entries: d.entries, tombstones: d.tombstones },
        lastSyncedAt: d.lastSyncedAt,
        knownVersion: d.version,
        fetchImpl,
        sleep: async () => {},
      });
      d.entries = result.entries;
      d.tombstones = result.tombstones;
      d.version = result.version;
      d.lastSyncedAt = result.syncedAt;
      return result;
    };
    // What the live check does: sync only if the server has news.
    d.poll = async () => {
      const remote = await checkVersion(code, fetchImpl);
      if (remote !== d.version) await d.sync();
    };
    return d;
  }

  it('does not upload when a sync has nothing new to add', async () => {
    const server = makeServer();
    const a = device(newSyncCode(), server.fetchImpl);
    a.entries = [{ id: 1, content: 'one', updatedAt: Date.now() }];
    await a.sync();
    expect(server.puts).toHaveLength(1);
    for (let i = 0; i < 5; i++) await a.sync();
    expect(server.puts).toHaveLength(1);
    expect(a.version).toBe(1);
  });

  it('two devices polling each other do not keep bumping the version', async () => {
    const server = makeServer();
    const code = newSyncCode();
    const a = device(code, server.fetchImpl);
    const b = device(code, server.fetchImpl);
    a.entries = [{ id: 1, content: 'from A', updatedAt: Date.now() }];
    await a.sync();
    await b.sync();
    expect(b.entries.map((x) => x.content)).toEqual(['from A']);

    const settledAt = server.puts.length;
    for (let round = 0; round < 6; round++) {
      await a.poll();
      await b.poll();
    }
    expect(server.puts).toHaveLength(settledAt);
  });

  it('one edit travels to the other device and then everything is quiet again', async () => {
    const server = makeServer();
    const code = newSyncCode();
    const a = device(code, server.fetchImpl);
    const b = device(code, server.fetchImpl);
    a.entries = [{ id: 1, content: 'first', updatedAt: 1000 }];
    await a.sync();
    await b.sync();

    b.entries = [{ ...b.entries[0], content: 'edited on B', updatedAt: Date.now() }];
    await b.sync();
    await a.poll();
    expect(a.entries[0].content).toBe('edited on B');

    const settledAt = server.puts.length;
    for (let round = 0; round < 4; round++) {
      await a.poll();
      await b.poll();
    }
    expect(server.puts).toHaveLength(settledAt);
    expect(a.version).toBe(b.version);
  });

  it('a clash settles with both devices agreeing, and then stays quiet', async () => {
    const server = makeServer();
    const code = newSyncCode();
    const a = device(code, server.fetchImpl);
    const b = device(code, server.fetchImpl);
    a.entries = [{ id: 1, content: 'start', date: '2026-10-01T10:00', updatedAt: 1000 }];
    await a.sync();
    await b.sync();

    const t = Date.now();
    a.entries = [{ ...a.entries[0], content: 'A wrote this', updatedAt: t + 1 }];
    b.entries = [{ ...b.entries[0], content: 'B wrote this', updatedAt: t + 2 }];
    await b.sync();
    await a.sync();
    await b.poll();
    await a.poll();

    expect(a.entries[0].content).toBe('B wrote this');
    expect(b.entries[0].content).toBe('B wrote this');
    expect(a.entries[0].conflict).toBeTruthy();
    expect(a.entries[0].history.map((h) => h.content)).toContain('A wrote this');

    const settledAt = server.puts.length;
    for (let round = 0; round < 4; round++) {
      await a.poll();
      await b.poll();
    }
    expect(server.puts).toHaveLength(settledAt);
  });
});
