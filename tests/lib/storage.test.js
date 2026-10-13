import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StorageFullError,
  WrongPasscodeError,
  clearDraft,
  ensureIDs,
  eraseJournal,
  getLockInfo,
  loadDraft,
  loadEntries,
  removePasscode,
  saveDraft,
  saveEntries,
  setPasscode,
  unlock,
} from '../../src/lib/storage.js';
import { quotaError, rawRecords } from '../helpers/journal.jsx';

const LEGACY_KEY = 'weatherJournalEntries';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an empty array when nothing is stored', async () => {
    expect(await loadEntries()).toEqual([]);
  });

  it('round-trips entries through save/load', async () => {
    const entries = [
      { id: 1, content: 'Hello', images: ['data:image/jpeg;base64,AAA'] },
      { id: 2, content: 'World' },
    ];
    await saveEntries(entries, []);
    expect(await loadEntries()).toEqual(entries);
  });

  it('writes only what changed between saves', async () => {
    const a = { id: 1, content: 'a' };
    const b = { id: 2, content: 'b' };
    await saveEntries([a, b], []);

    const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put');
    const bEdited = { ...b, content: 'b2' };
    await saveEntries([bEdited], [a, b]); // a deleted, b changed

    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(putSpy).toHaveBeenCalledWith(bEdited);
    expect(await loadEntries()).toEqual([bEdited]);
  });

  it('throws a StorageFullError with a readable message when storage is full', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw quotaError();
    });

    await expect(saveEntries([{ id: 1, content: 'x' }], [])).rejects.toThrow(StorageFullError);
    await expect(saveEntries([{ id: 1, content: 'x' }], [])).rejects.toThrow(/out of storage space/);
    expect(await loadEntries()).toEqual([]);
  });

  it('rethrows other storage errors unchanged', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(saveEntries([{ id: 1, content: 'x' }], [])).rejects.toThrow('boom');
  });

  describe('moving entries from localStorage', () => {
    it('moves old entries into IndexedDB and removes the old copy', async () => {
      const legacy = [{ id: 1, content: 'From before' }, { content: 'No id yet' }];
      localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));

      const loaded = await loadEntries();

      expect(loaded).toHaveLength(2);
      expect(loaded[0]).toEqual({ id: 1, content: 'From before' });
      expect(loaded[1].id).toBeDefined();
      expect(await rawRecords()).toHaveLength(2);
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it('keeps the old copy if moving fails', async () => {
      localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 1, content: 'Keep me' }]));
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
        throw quotaError();
      });

      await expect(loadEntries()).rejects.toThrow(StorageFullError);
      expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
    });

    it('ignores corrupt or non-array old data', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem(LEGACY_KEY, '{not valid json');
      expect(await loadEntries()).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();

      localStorage.setItem(LEGACY_KEY, JSON.stringify({ foo: 'bar' }));
      expect(await loadEntries()).toEqual([]);
    });
  });

  describe('passcode lock', () => {
    const entries = [
      { id: 1, content: 'Secret thoughts', mood: 'Sad' },
      { id: 2, content: 'More secrets' },
    ];

    it('encrypts every entry on disk', async () => {
      await saveEntries(entries, []);
      await setPasscode('correct horse', entries);

      const records = await rawRecords();
      expect(records).toHaveLength(2);
      for (const record of records) {
        expect(Object.keys(record).sort()).toEqual(['data', 'id', 'iv']);
        expect(JSON.stringify(record)).not.toContain('ecret');
      }
      expect(await getLockInfo()).toMatchObject({ iterations: 310000 });
    });

    it('unlocks with the right passcode and decrypts entries', async () => {
      await setPasscode('correct horse', entries);
      const key = await unlock('correct horse');
      expect(await loadEntries(key)).toEqual(entries);
    });

    it('rejects a wrong passcode', async () => {
      await setPasscode('correct horse', entries);
      await expect(unlock('wrong')).rejects.toThrow(WrongPasscodeError);
    });

    it('encrypts later saves with the key', async () => {
      const key = await setPasscode('pass', []);
      const entry = { id: 3, content: 'Written while locked' };
      await saveEntries([entry], [], key);

      expect(JSON.stringify(await rawRecords())).not.toContain('Written');
      expect(await loadEntries(key)).toEqual([entry]);
    });

    it('changing the passcode re-encrypts so only the new one works', async () => {
      await setPasscode('old', entries);
      await setPasscode('new', entries);

      await expect(unlock('old')).rejects.toThrow(WrongPasscodeError);
      expect(await loadEntries(await unlock('new'))).toEqual(entries);
    });

    it('turning the lock off stores entries in plain form again', async () => {
      await setPasscode('pass', entries);
      await removePasscode(entries);

      expect(await getLockInfo()).toBeNull();
      expect(await rawRecords()).toEqual(entries);
    });

    it('erasing removes entries and the lock', async () => {
      await setPasscode('pass', entries);
      await eraseJournal();

      expect(await getLockInfo()).toBeNull();
      expect(await loadEntries()).toEqual([]);
    });
  });

  describe('drafts', () => {
    it('saves, loads, and clears a draft', async () => {
      await saveDraft('new', { content: 'Half a thought' });
      expect(await loadDraft('new')).toEqual({ content: 'Half a thought' });

      await clearDraft('new');
      expect(await loadDraft('new')).toBeNull();
    });

    it('encrypts drafts when the lock is on', async () => {
      const key = await setPasscode('pass', []);
      await saveDraft('new', { content: 'Private draft' }, key);

      expect(JSON.stringify(await rawRecords('meta'))).not.toContain('Private');
      expect(await loadDraft('new', key)).toEqual({ content: 'Private draft' });
    });

    it('drops drafts when the lock changes, so none stay unencrypted', async () => {
      await saveDraft('new', { content: 'Plain draft' });
      const key = await setPasscode('pass', []);
      expect(await loadDraft('new', key)).toBeNull();
      expect(JSON.stringify(await rawRecords('meta'))).not.toContain('Plain draft');
    });
  });

  it('assigns ids to entries missing one', () => {
    const { entries, hasChanges } = ensureIDs([{ title: 'no id' }, { id: 5, title: 'has id' }]);
    expect(hasChanges).toBe(true);
    expect(entries[0].id).toBeDefined();
    expect(entries[1].id).toBe(5);
  });

  it('reports no changes when every entry already has an id', () => {
    const { hasChanges } = ensureIDs([{ id: 1 }, { id: 2 }]);
    expect(hasChanges).toBe(false);
  });
});
