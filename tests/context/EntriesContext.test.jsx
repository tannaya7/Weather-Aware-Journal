import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';
import { EntriesProvider, useEntriesContext } from '../../src/context/EntriesContext.jsx';

function wrapper({ children }) {
  return (
    <AnnouncerProvider>
      <EntriesProvider>{children}</EntriesProvider>
    </AnnouncerProvider>
  );
}

describe('EntriesContext delete/undo', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tracks a pending undo after delete, and clears it after undoDelete', () => {
    const { result } = renderHook(() => useEntriesContext(), { wrapper });
    let added;

    act(() => {
      added = result.current.addEntry({ content: 'Gone soon' });
    });
    expect(result.current.entries).toHaveLength(1);

    act(() => {
      result.current.deleteEntry(added.id);
    });
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.pendingUndo).toMatchObject({ id: added.id });

    act(() => {
      result.current.undoDelete();
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.pendingUndo).toBeNull();
  });

  it('dismissUndo clears the pending entry without restoring it', () => {
    const { result } = renderHook(() => useEntriesContext(), { wrapper });
    let added;

    act(() => {
      added = result.current.addEntry({ content: 'Gone for good' });
    });
    act(() => {
      result.current.deleteEntry(added.id);
    });
    act(() => {
      result.current.dismissUndo();
    });

    expect(result.current.pendingUndo).toBeNull();
    expect(result.current.entries).toHaveLength(0);
  });
});
