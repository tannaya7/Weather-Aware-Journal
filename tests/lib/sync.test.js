import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeJournals, sameEntries } from '../../src/lib/syncMerge.js';
import {
  deriveSyncIdentity,
  formatSyncCode,
  isValidSyncCode,
  newSyncCode,
  requestReflection,
  setServerUrl,
  syncJournal,
} from '../../src/lib/syncClient.js';
import { handle } from '../../worker/src/index.js';

// The real worker, in memory: requests from the client code go straight to
// its handler, with a Map standing in for Workers KV.
function inMemoryServer(extraEnv = {}, deps = {}) {
  const store = new Map();
  const env = {
    ALLOWED_ORIGINS: '',
    JOURNAL: {
      get: async (k, type) => (store.has(k) ? (type === 'json' ? JSON.parse(store.get(k)) : store.get(k)) : null),
      put: async (k, v) => store.set(k, v),
      delete: async (k) => store.delete(k),
      list: async ({ prefix }) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
    },
    ...extraEnv,
  };
  const fetchImpl = (url, init) => handle(new Request(url, init), env, deps);
  return { store, env, fetchImpl };
}

describe('mergeJournals', () => {
  it('keeps the newest version of each entry', () => {
    const merged = mergeJournals(
      { entries: [{ id: 1, content: 'old', updatedAt: 1 }, { id: 2, content: 'mine', updatedAt: 5 }], tombstones: {} },
      { entries: [{ id: 1, content: 'new', updatedAt: 2 }, { id: 3, content: 'theirs', updatedAt: 1 }], tombstones: {} },
    );
    expect(merged.entries.map((e) => e.content)).toEqual(['new', 'mine', 'theirs']);
  });

  it('lets a delete win over older edits, but not newer ones', () => {
    const merged = mergeJournals(
      { entries: [{ id: 1, content: 'edited before delete', updatedAt: 1 }, { id: 2, content: 'edited after', updatedAt: 9 }], tombstones: {} },
      { entries: [], tombstones: { 1: 5, 2: 5 } },
    );
    expect(merged.entries.map((e) => e.id)).toEqual([2]);
    expect(merged.tombstones).toEqual({ 1: 5, 2: 5 });
  });

  it('treats entries from before sync (no updatedAt) as oldest', () => {
    const merged = mergeJournals(
      { entries: [{ id: 1, content: 'legacy' }], tombstones: {} },
      { entries: [{ id: 1, content: 'edited elsewhere', updatedAt: 3 }], tombstones: {} },
    );
    expect(merged.entries[0].content).toBe('edited elsewhere');
  });

  it('sameEntries compares by identity', () => {
    const a = { id: 1 };
    expect(sameEntries([a], [a])).toBe(true);
    expect(sameEntries([a], [{ id: 1 }])).toBe(false);
  });
});

describe('sync codes', () => {
  it('are 256-bit, readable in groups, and derive a stable identity', async () => {
    const code = newSyncCode();
    expect(isValidSyncCode(code)).toBe(true);
    expect(isValidSyncCode(formatSyncCode(code))).toBe(true);
    expect(isValidSyncCode('too short')).toBe(false);

    const a = await deriveSyncIdentity(code);
    const b = await deriveSyncIdentity(formatSyncCode(code));
    expect(a.vaultId).toBe(b.vaultId);
    expect(a.vaultId).toMatch(/^[0-9a-f]{64}$/);
    expect(a.token).not.toBe(a.vaultId);
    expect(a.vaultId).not.toContain(code);
  });
});

describe('syncing two devices through the server', () => {
  beforeEach(() => setServerUrl('https://server.example'));
  afterEach(() => setServerUrl(null));

  it('merges both devices’ entries and stores only ciphertext', async () => {
    const server = inMemoryServer();
    const code = newSyncCode();

    const phone = await syncJournal({
      code,
      local: { entries: [{ id: 1, content: 'Written on my phone', updatedAt: 1 }], tombstones: {} },
      fetchImpl: server.fetchImpl,
    });
    expect(phone.version).toBe(1);

    const laptop = await syncJournal({
      code,
      local: { entries: [{ id: 2, content: 'Written on my laptop', updatedAt: 2 }], tombstones: {} },
      fetchImpl: server.fetchImpl,
    });
    expect(laptop.entries.map((e) => e.content).sort()).toEqual(['Written on my laptop', 'Written on my phone']);

    const everythingStored = [...server.store.values()].join(' ');
    expect(everythingStored).not.toContain('Written on');
    expect(everythingStored).not.toContain(code);
  });

  it('carries deletes to the other device', async () => {
    const server = inMemoryServer();
    const code = newSyncCode();
    await syncJournal({ code, local: { entries: [{ id: 1, content: 'Gone soon', updatedAt: 1 }], tombstones: {} }, fetchImpl: server.fetchImpl });

    await syncJournal({ code, local: { entries: [], tombstones: { 1: 10 } }, fetchImpl: server.fetchImpl });
    const other = await syncJournal({
      code,
      local: { entries: [{ id: 1, content: 'Gone soon', updatedAt: 1 }], tombstones: {} },
      fetchImpl: server.fetchImpl,
    });

    expect(other.entries).toEqual([]);
  });

  it('recovers when another device syncs in between (409)', async () => {
    const server = inMemoryServer();
    const code = newSyncCode();
    await syncJournal({ code, local: { entries: [{ id: 1, content: 'a', updatedAt: 1 }], tombstones: {} }, fetchImpl: server.fetchImpl });

    // Another device sneaks an upload in right after our download.
    let sneaked = false;
    const racing = async (url, init) => {
      const response = await server.fetchImpl(url, init);
      if (!sneaked && (init?.method || 'GET') === 'GET') {
        sneaked = true;
        await syncJournal({ code, local: { entries: [{ id: 2, content: 'b', updatedAt: 2 }], tombstones: {} }, fetchImpl: server.fetchImpl });
      }
      return response;
    };
    const result = await syncJournal({ code, local: { entries: [{ id: 3, content: 'c', updatedAt: 3 }], tombstones: {} }, fetchImpl: racing });

    expect(result.entries.map((e) => e.content).sort()).toEqual(['a', 'b', 'c']);
  });

  it('a different code cannot read or overwrite the journal', async () => {
    const server = inMemoryServer();
    const code = newSyncCode();
    await syncJournal({ code, local: { entries: [{ id: 1, content: 'private', updatedAt: 1 }], tombstones: {} }, fetchImpl: server.fetchImpl });

    const stranger = await syncJournal({ code: newSyncCode(), local: { entries: [], tombstones: {} }, fetchImpl: server.fetchImpl });
    expect(stranger.entries).toEqual([]); // a separate, new journal
  });

  it('asks the server for a reflection with the sync identity', async () => {
    const create = vi.fn(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'A calm week.' }] }));
    const server = inMemoryServer({ ANTHROPIC_API_KEY: 'test' }, { client: { beta: { messages: { create } } } });
    const code = newSyncCode();
    await syncJournal({ code, local: { entries: [], tombstones: {} }, fetchImpl: server.fetchImpl });

    const reply = await requestReflection(code, { scope: 'week', entries: [{ date: 'Mon', text: 'Quiet day' }] }, server.fetchImpl);

    expect(reply.text).toBe('A calm week.');
    expect(create.mock.calls[0][0].messages[0].content).toContain('Quiet day');
  });
});
