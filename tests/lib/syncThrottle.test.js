import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncError, newSyncCode, setServerUrl, syncJournal } from '../../src/lib/syncClient.js';
import { handle } from '../../worker/src/index.js';

// The real worker in memory, with a clock the test controls.
function server(clockRef) {
  const store = new Map();
  const env = {
    ALLOWED_ORIGINS: '',
    JOURNAL: {
      get: async (k, type) => (store.has(k) ? (type === 'json' ? JSON.parse(store.get(k)) : store.get(k)) : null),
      put: async (k, v) => store.set(k, v),
      delete: async (k) => store.delete(k),
      list: async () => ({ keys: [], list_complete: true }),
    },
  };
  const deps = { now: () => clockRef.now };
  return { store, fetchImpl: (url, init) => handle(new Request(url, init), env, deps) };
}

const entry = (id, content) => ({ id, content, updatedAt: id });
const local = (...entries) => ({ entries, tombstones: {} });

describe('syncing when the server says to slow down', () => {
  beforeEach(() => setServerUrl('https://server.example'));
  afterEach(() => setServerUrl(''));

  it('waits as long as the server asks, then finishes the sync', async () => {
    const clock = { now: 5_000_000 };
    const s = server(clock);
    const code = newSyncCode();
    await syncJournal({ code, local: local(entry(1, 'a')), fetchImpl: s.fetchImpl });

    const sleep = vi.fn(async (ms) => {
      clock.now += ms;
    });
    const result = await syncJournal({ code, local: local(entry(2, 'b')), fetchImpl: s.fetchImpl, sleep });

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(result.entries.map((e) => e.content).sort()).toEqual(['a', 'b']);
    expect(result.version).toBe(2);
  });

  it('merges again after waiting, in case another device wrote meanwhile', async () => {
    const clock = { now: 5_000_000 };
    const s = server(clock);
    const code = newSyncCode();
    await syncJournal({ code, local: local(entry(1, 'a')), fetchImpl: s.fetchImpl });

    // While this device waits, another device uploads.
    const sleep = vi.fn(async (ms) => {
      clock.now += ms;
      if (sleep.mock.calls.length === 1) {
        await syncJournal({ code, local: local(entry(3, 'from elsewhere')), fetchImpl: s.fetchImpl, sleep: async () => {} });
        clock.now += 2000;
      }
    });
    const result = await syncJournal({ code, local: local(entry(2, 'b')), fetchImpl: s.fetchImpl, sleep });
    expect(result.entries.map((e) => e.content).sort()).toEqual(['a', 'b', 'from elsewhere']);
  });

  it('never waits longer than ten seconds for one request', async () => {
    const calls = [];
    let n = 0;
    const fetchImpl = async (url, init) => {
      if ((init?.method || 'GET') === 'GET') return new Response(JSON.stringify({ version: 0, data: null }), { status: 200 });
      n += 1;
      if (n === 1) return new Response(JSON.stringify({ error: 'slow down' }), { status: 429, headers: { 'retry-after': '120' } });
      return new Response(JSON.stringify({ version: 1 }), { status: 200 });
    };
    await syncJournal({ code: newSyncCode(), local: local(entry(1, 'a')), fetchImpl, sleep: async (ms) => calls.push(ms) });
    expect(calls).toEqual([10_000]);
  });

  it('gives up with a clear message if it keeps being told to wait', async () => {
    const fetchImpl = async (url, init) => {
      if ((init?.method || 'GET') === 'GET') return new Response(JSON.stringify({ version: 0, data: null }), { status: 200 });
      return new Response(JSON.stringify({ error: 'slow down' }), { status: 429, headers: { 'retry-after': '1' } });
    };
    const sleep = vi.fn(async () => {});
    await expect(
      syncJournal({ code: newSyncCode(), local: local(entry(1, 'a')), fetchImpl, sleep }),
    ).rejects.toThrow('Another device kept syncing');
    expect(sleep).toHaveBeenCalledTimes(5);
  });

  it('does not wait on a 429 without a Retry-After (for example a sign-in block)', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: 'Too many failed attempts' }), { status: 429 });
    const sleep = vi.fn();
    const error = await syncJournal({ code: newSyncCode(), local: local(), fetchImpl, sleep }).catch((e) => e);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.status).toBe(429);
    expect(error.message).toBe('Too many failed attempts');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('carries the Retry-After value on the error', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: 'Too many failed attempts' }), { status: 429, headers: { 'retry-after': '90' } });
    const error = await syncJournal({ code: newSyncCode(), local: local(), fetchImpl, sleep: async () => {}, maxAttempts: 1 }).catch((e) => e);
    expect(error.retryAfter).toBe(90);
  });
});
