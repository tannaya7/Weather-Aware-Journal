import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEntries } from '../../src/hooks/useEntries.js';
import { loadEntries, setPasscode } from '../../src/lib/storage.js';
import { quotaError, seedEntries } from '../helpers/journal.jsx';

async function renderReady() {
  const hook = renderHook(() => useEntries());
  await waitFor(() => expect(hook.result.current.status).not.toBe('loading'));
  return hook;
}

describe('useEntries', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts loading, then is ready and empty with no saved entries', async () => {
    const hook = renderHook(() => useEntries());
    expect(hook.result.current.status).toBe('loading');

    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.entries).toEqual([]);
  });

  it('loads entries saved earlier', async () => {
    await seedEntries([{ id: 1, content: 'Saved before' }]);
    const { result } = await renderReady();
    expect(result.current.entries).toEqual([{ id: 1, content: 'Saved before' }]);
  });

  it('adds an entry and persists it', async () => {
    const { result } = await renderReady();

    let added;
    await act(async () => {
      added = await result.current.addEntry({ content: 'Body' });
    });

    expect(result.current.entries).toEqual([added]);
    expect(await loadEntries()).toEqual([added]);
  });

  it('updates an existing entry by id', async () => {
    const { result } = await renderReady();
    let added;
    await act(async () => {
      added = await result.current.addEntry({ content: 'Original' });
    });
    await act(async () => {
      await result.current.updateEntry(added.id, { content: 'Updated' });
    });

    expect(result.current.entries[0]).toMatchObject({ id: added.id, content: 'Updated' });
    expect(result.current.entries[0].updatedAt).toBeGreaterThanOrEqual(added.updatedAt);
    expect((await loadEntries())[0].content).toBe('Updated');
  });

  it('deletes an entry and returns the removed record', async () => {
    const { result } = await renderReady();
    let added;
    let removed;
    await act(async () => {
      added = await result.current.addEntry({ content: 'ToDelete' });
    });
    await act(async () => {
      removed = await result.current.deleteEntry(added.id);
    });

    expect(removed.content).toBe('ToDelete');
    expect(result.current.entries).toHaveLength(0);
    expect(await loadEntries()).toEqual([]);
  });

  it('applies quick successive changes in order', async () => {
    const { result } = await renderReady();
    let added;
    await act(async () => {
      added = await result.current.addEntry({ content: 'Back and forth' });
    });

    // Not awaited one by one: delete and restore are queued back to back.
    await act(async () => {
      const removal = result.current.deleteEntry(added.id);
      const restore = result.current.restoreEntry(added);
      await Promise.all([removal, restore]);
    });

    // Restoring counts as a change (fresh updatedAt), so sync won't treat it as deleted.
    expect(result.current.entries).toMatchObject([{ id: added.id, content: added.content }]);
    expect(await loadEntries()).toMatchObject([{ id: added.id, content: added.content }]);
  });

  it('imports entries and skips duplicates by id', async () => {
    const { result } = await renderReady();
    let added;
    await act(async () => {
      added = await result.current.addEntry({ content: 'Existing' });
    });

    let importResult;
    await act(async () => {
      importResult = await result.current.importEntries(
        JSON.stringify([
          { id: added.id, content: 'Dup' },
          { content: 'New one' },
        ]),
      );
    });

    expect(importResult.importedCount).toBe(1);
    expect(importResult.skippedCount).toBe(1);
    expect(result.current.entries).toHaveLength(2);
  });

  it('rejects and keeps the list unchanged when saving fails', async () => {
    const { result } = await renderReady();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw quotaError();
    });

    await act(async () => {
      await expect(result.current.addEntry({ content: 'Too big' })).rejects.toThrow(
        /out of storage space/,
      );
    });
    expect(result.current.entries).toHaveLength(0);
  });

  it('keeps working after a failed save', async () => {
    const { result } = await renderReady();
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw quotaError();
    });

    await act(async () => {
      await result.current.addEntry({ content: 'Fails' }).catch(() => {});
    });
    spy.mockRestore();
    await act(async () => {
      await result.current.addEntry({ content: 'Works' });
    });

    expect(result.current.entries.map((e) => e.content)).toEqual(['Works']);
  });

  describe('passcode lock', () => {
    it('opens locked when a passcode is set, and unlock loads the entries', async () => {
      await setPasscode('1234', [{ id: 1, content: 'Hidden' }]);
      const { result } = await renderReady();

      expect(result.current.status).toBe('locked');
      expect(result.current.entries).toEqual([]);

      await act(async () => {
        await result.current.unlock('1234');
      });
      expect(result.current.status).toBe('ready');
      expect(result.current.entries).toEqual([{ id: 1, content: 'Hidden' }]);
    });

    it('lock() hides the entries again', async () => {
      await setPasscode('1234', [{ id: 1, content: 'Hidden' }]);
      const { result } = await renderReady();
      await act(async () => {
        await result.current.unlock('1234');
      });

      await act(async () => {
        result.current.lock();
      });

      await waitFor(() => expect(result.current.status).toBe('locked'));
      expect(result.current.entries).toEqual([]);
    });

    it('needs the current passcode to turn the lock off', async () => {
      const { result } = await renderReady();
      await act(async () => {
        await result.current.enableLock('1234');
      });
      expect(result.current.lockEnabled).toBe(true);

      await act(async () => {
        await expect(result.current.disableLock('nope')).rejects.toThrow(/isn't right/);
      });
      expect(result.current.lockEnabled).toBe(true);

      await act(async () => {
        await result.current.disableLock('1234');
      });
      expect(result.current.lockEnabled).toBe(false);
    });
  });
});
