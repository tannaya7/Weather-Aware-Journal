import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEntries } from '../../src/hooks/useEntries.js';

describe('useEntries', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty when localStorage has no entries', () => {
    const { result } = renderHook(() => useEntries());
    expect(result.current.entries).toEqual([]);
  });

  it('adds an entry and persists it to localStorage', () => {
    const { result } = renderHook(() => useEntries());

    act(() => {
      result.current.addEntry({ title: 'Test', content: 'Body' });
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].title).toBe('Test');
    expect(JSON.parse(localStorage.getItem('weatherJournalEntries'))).toHaveLength(1);
  });

  it('updates an existing entry by id', () => {
    const { result } = renderHook(() => useEntries());
    let added;

    act(() => {
      added = result.current.addEntry({ title: 'Original', content: 'Body' });
    });

    act(() => {
      result.current.updateEntry(added.id, { title: 'Updated', content: 'Body' });
    });

    expect(result.current.entries[0].title).toBe('Updated');
    expect(result.current.entries[0].id).toBe(added.id);
  });

  it('deletes an entry and returns the removed record', () => {
    const { result } = renderHook(() => useEntries());
    let added;

    act(() => {
      added = result.current.addEntry({ title: 'ToDelete', content: 'Body' });
    });

    let removed;
    act(() => {
      removed = result.current.deleteEntry(added.id);
    });

    expect(removed.title).toBe('ToDelete');
    expect(result.current.entries).toHaveLength(0);
  });

  it('restores a deleted entry via restoreEntry', () => {
    const { result } = renderHook(() => useEntries());
    let added;

    act(() => {
      added = result.current.addEntry({ title: 'Restore me', content: 'Body' });
    });
    act(() => {
      result.current.deleteEntry(added.id);
    });
    act(() => {
      result.current.restoreEntry(added);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].id).toBe(added.id);
  });

  it('imports entries and skips duplicates by id', () => {
    const { result } = renderHook(() => useEntries());
    let added;

    act(() => {
      added = result.current.addEntry({ title: 'Existing', content: 'Body' });
    });

    let importResult;
    act(() => {
      importResult = result.current.importEntries(
        JSON.stringify([
          { id: added.id, title: 'Dup', content: 'x' },
          { title: 'New one', content: 'y' },
        ]),
      );
    });

    expect(importResult.importedCount).toBe(1);
    expect(importResult.skippedCount).toBe(1);
    expect(result.current.entries).toHaveLength(2);
  });
});
