import { createContext, useCallback, useContext, useState } from 'react';
import { useEntries } from '../hooks/useEntries.js';
import { useAnnouncer } from './AnnouncerContext.jsx';
import { getEntryTitle } from '../lib/entryTitle.js';

const EntriesContext = createContext(null);

// Instantiates useEntries() exactly once at the app root so the same entries
// array (and its persistence) is shared across every route, and layers a
// single global delete/undo lifecycle on top so the undo toast works no
// matter which page (timeline or reading view) triggered the delete.
export function EntriesProvider({ children }) {
  const base = useEntries();
  const { announce } = useAnnouncer();
  const [pendingUndo, setPendingUndo] = useState(null);

  const deleteEntry = useCallback(
    (id) => {
      const removed = base.deleteEntry(id);
      setPendingUndo(removed);
      announce(`Entry "${getEntryTitle(removed)}" deleted. Undo available.`, 'assertive');
      return removed;
    },
    [base, announce],
  );

  const undoDelete = useCallback(() => {
    setPendingUndo((current) => {
      if (current) {
        base.restoreEntry(current);
        announce(`Entry "${getEntryTitle(current)}" restored.`);
      }
      return null;
    });
  }, [base, announce]);

  const dismissUndo = useCallback(() => setPendingUndo(null), []);

  const value = { ...base, deleteEntry, pendingUndo, undoDelete, dismissUndo };

  return <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>;
}

export function useEntriesContext() {
  const ctx = useContext(EntriesContext);
  if (!ctx) throw new Error('useEntriesContext must be used within an EntriesProvider');
  return ctx;
}
