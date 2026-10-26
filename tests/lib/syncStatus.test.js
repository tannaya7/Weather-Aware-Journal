import { describe, expect, it } from 'vitest';
import {
  SYNC_TIMING,
  classifyFailure,
  describeSync,
  hasRemoteChanges,
  pendingChanges,
  retryDelay,
} from '../../src/lib/syncStatus.js';

describe('retryDelay', () => {
  it('waits longer each time, up to a limit', () => {
    expect([0, 1, 2, 3, 4].map((n) => retryDelay(n))).toEqual([5_000, 15_000, 45_000, 120_000, 300_000]);
    expect(retryDelay(5)).toBe(300_000);
    expect(retryDelay(50)).toBe(300_000);
  });

  it('honors a longer wait the server asked for, but never a shorter one', () => {
    expect(retryDelay(0, 90)).toBe(90_000);
    expect(retryDelay(4, 10)).toBe(300_000);
    expect(retryDelay(0, null)).toBe(5_000);
  });

  it('uses the timing it is given', () => {
    expect(retryDelay(0, null, { backoffMs: [10, 20] })).toBe(10);
    expect(retryDelay(9, null, { backoffMs: [10, 20] })).toBe(20);
  });

  it('has sensible defaults for live checks', () => {
    expect(SYNC_TIMING.pollMs).toBeGreaterThanOrEqual(10_000);
    expect(SYNC_TIMING.minCheckGapMs).toBeLessThan(SYNC_TIMING.pollMs);
  });
});

describe('classifyFailure', () => {
  it('waits for the connection when offline', () => {
    expect(classifyFailure({ code: 'network', message: 'No connection' })).toEqual({ kind: 'offline', message: 'No connection' });
  });

  it('retries when the server is busy or having a problem', () => {
    expect(classifyFailure({ code: 'rate-limited', message: 'slow' }).kind).toBe('retry');
    expect(classifyFailure({ code: 'server', message: 'oops' }).kind).toBe('retry');
    expect(classifyFailure({ code: 'request', message: 'odd' }).kind).toBe('retry');
  });

  it('retries anything unexpected rather than giving up', () => {
    expect(classifyFailure(null)).toMatchObject({ kind: 'retry' });
    expect(classifyFailure(new Error('weird'))).toMatchObject({ kind: 'retry', message: 'weird' });
  });

  it('pauses, with a reason, when only a person can fix it', () => {
    const deleted = classifyFailure({ code: 'remote-deleted' });
    expect(deleted.kind).toBe('paused');
    expect(deleted.message).toMatch(/deleted from the server/);
    expect(classifyFailure({ code: 'wrong-code' }).kind).toBe('paused');
    const auth = classifyFailure({ code: 'auth' });
    expect(auth.kind).toBe('paused');
    expect(auth.message).toMatch(/sync code/);
  });
});

describe('pendingChanges', () => {
  const entries = [
    { id: 1, updatedAt: 1000 },
    { id: 2, updatedAt: 3000 },
    { id: 3, updatedAt: 5000 },
    { id: 4 }, // from before sync existed
  ];

  it('counts edits and deletions made after the last sync', () => {
    expect(pendingChanges(entries, { 9: 4000, 8: 500 }, 2000)).toBe(3); // entries 2 and 3, tombstone 9
    expect(pendingChanges(entries, {}, 5000)).toBe(0);
    expect(pendingChanges(entries, undefined, 4000)).toBe(1);
  });

  it('counts everything before the first sync', () => {
    expect(pendingChanges(entries, { 9: 1 }, null)).toBe(5);
    expect(pendingChanges([], {}, undefined)).toBe(0);
  });

  it('does not count old entries that have no timestamp', () => {
    expect(pendingChanges([{ id: 1 }], {}, 100)).toBe(0);
  });
});

describe('hasRemoteChanges', () => {
  it('is true only when the server version differs from the last synced one', () => {
    expect(hasRemoteChanges(5, 5)).toBe(false);
    expect(hasRemoteChanges(6, 5)).toBe(true);
    expect(hasRemoteChanges(0, 5)).toBe(true); // deleted or reset
    expect(hasRemoteChanges(1, undefined)).toBe(true);
    expect(hasRemoteChanges(0, undefined)).toBe(false);
    expect(hasRemoteChanges(undefined, 3)).toBe(false);
    expect(hasRemoteChanges('7', 3)).toBe(false);
  });
});

describe('describeSync', () => {
  const time = (t) => `T${t}`;
  const base = { status: 'idle', error: '', pending: 0, lastSyncedAt: 100 };

  it('says where things stand', () => {
    expect(describeSync(base, time)).toBe('Synced · last T100');
    expect(describeSync({ ...base, lastSyncedAt: null }, time)).toBe('Not synced yet');
    expect(describeSync({ ...base, status: 'syncing' }, time)).toBe('Syncing…');
  });

  it('mentions waiting changes, singular and plural', () => {
    expect(describeSync({ ...base, pending: 1 }, time)).toBe('Synced · last T100 · 1 change waiting to sync');
    expect(describeSync({ ...base, pending: 3 }, time)).toContain('3 changes waiting to sync');
  });

  it('reassures when offline', () => {
    expect(describeSync({ ...base, status: 'offline', pending: 2 }, time)).toBe(
      'Offline. 2 changes saved on this device will sync when you are back online.',
    );
    expect(describeSync({ ...base, status: 'offline' }, time)).toMatch(/Everything is saved on this device/);
  });

  it('explains problems and pauses', () => {
    expect(describeSync({ ...base, status: 'error', error: 'Server error (503)', pending: 1 }, time)).toBe(
      'Sync problem: Server error (503) Trying again soon. 1 change waiting.',
    );
    expect(describeSync({ ...base, status: 'paused', error: 'Copy deleted.' }, time)).toBe('Sync is paused. Copy deleted.');
  });
});
