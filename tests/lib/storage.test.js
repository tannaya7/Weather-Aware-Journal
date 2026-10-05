import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEntries, saveEntries, ensureIDs, StorageFullError } from '../../src/lib/storage.js';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty array when nothing is stored', () => {
    expect(loadEntries()).toEqual([]);
  });

  it('round-trips entries through save/load', () => {
    const entries = [{ id: 1, title: 'Hello' }];
    saveEntries(entries);
    expect(loadEntries()).toEqual(entries);
  });

  it('returns an empty array and warns on corrupt JSON', () => {
    localStorage.setItem('weatherJournalEntries', '{not valid json');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadEntries()).toEqual([]);
    warnSpy.mockRestore();
  });

  it('throws a StorageFullError with a readable message when storage is full', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    expect(() => saveEntries([{ id: 1 }])).toThrow(StorageFullError);
    expect(() => saveEntries([{ id: 1 }])).toThrow(/out of storage space/);
    spy.mockRestore();
  });

  it('rethrows other storage errors unchanged', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => saveEntries([])).toThrow('boom');
    spy.mockRestore();
  });

  it('returns an empty array when stored value is not an array', () => {
    localStorage.setItem('weatherJournalEntries', JSON.stringify({ foo: 'bar' }));
    expect(loadEntries()).toEqual([]);
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
