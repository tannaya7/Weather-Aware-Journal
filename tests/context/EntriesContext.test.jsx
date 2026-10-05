import { act, renderHook, waitFor } from '@testing-library/react';
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

// The provider only renders its children once the journal has loaded.
async function renderReady() {
  const hook = renderHook(() => useEntriesContext(), { wrapper });
  await waitFor(() => expect(hook.result.current).toBeTruthy());
  return hook;
}

describe('EntriesContext delete/undo', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tracks a pending undo after delete, and clears it after undoDelete', async () => {
    const { result } = await renderReady();
    let added;

    await act(async () => {
      added = await result.current.addEntry({ content: 'Gone soon' });
    });
    expect(result.current.entries).toHaveLength(1);

    await act(async () => {
      await result.current.deleteEntry(added.id);
    });
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.pendingUndo).toMatchObject({ id: added.id });

    await act(async () => {
      await result.current.undoDelete();
    });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.pendingUndo).toBeNull();
  });

  it('dismissUndo clears the pending entry without restoring it', async () => {
    const { result } = await renderReady();
    let added;

    await act(async () => {
      added = await result.current.addEntry({ content: 'Gone for good' });
    });
    await act(async () => {
      await result.current.deleteEntry(added.id);
    });
    act(() => {
      result.current.dismissUndo();
    });

    expect(result.current.pendingUndo).toBeNull();
    expect(result.current.entries).toHaveLength(0);
  });
});
