import { useCallback, useState } from 'react';
import { loadEntries, saveEntries, ensureIDs } from '../lib/storage.js';
import { mergeImportedEntries } from '../lib/exportImport.js';

function initialEntries() {
  const { entries, hasChanges } = ensureIDs(loadEntries());
  if (hasChanges) saveEntries(entries);
  return entries;
}

// Owns the journal entries array and every mutation to it, persisting to
// localStorage on every change. Kept separate from search/sort/pagination,
// which are view-level concerns handled by the Dashboard page.
export function useEntries() {
  const [entries, setEntries] = useState(initialEntries);

  const persist = useCallback((next) => {
    setEntries(next);
    saveEntries(next);
  }, []);

  const addEntry = useCallback(
    (data) => {
      const entry = { id: Date.now() + Math.random(), ...data };
      persist([...entries, entry]);
      return entry;
    },
    [entries, persist],
  );

  const updateEntry = useCallback(
    (id, data) => {
      persist(entries.map((e) => (e.id === id ? { ...e, ...data, id } : e)));
    },
    [entries, persist],
  );

  const deleteEntry = useCallback(
    (id) => {
      const removed = entries.find((e) => e.id === id) || null;
      persist(entries.filter((e) => e.id !== id));
      return removed;
    },
    [entries, persist],
  );

  const restoreEntry = useCallback(
    (entry) => {
      if (!entry) return;
      persist([...entries, entry]);
    },
    [entries, persist],
  );

  const getEntryById = useCallback((id) => entries.find((e) => String(e.id) === String(id)), [entries]);

  const importEntries = useCallback(
    (jsonText) => {
      const result = mergeImportedEntries(entries, jsonText);
      persist(result.entries);
      return result;
    },
    [entries, persist],
  );

  return {
    entries,
    addEntry,
    updateEntry,
    deleteEntry,
    restoreEntry,
    getEntryById,
    importEntries,
  };
}
