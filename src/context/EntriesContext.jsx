import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useEntries } from '../hooks/useEntries.js';
import { useAnnouncer } from './AnnouncerContext.jsx';
import { getEntryTitle } from '../lib/entryTitle.js';
import { LockScreen } from '../components/LockScreen/LockScreen.jsx';

const EntriesContext = createContext(null);

// Lock again after the app has been in the background this long.
export const AUTO_LOCK_AFTER_MS = 5 * 60 * 1000;

function StatusScreen({ title, children }) {
  return (
    <div className="app-status" role="main" id="main-content">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

// Instantiates useEntries() exactly once at the app root so the same entries
// array (and its persistence) is shared across every route, and layers a
// single global delete/undo lifecycle on top so the undo toast works no
// matter which page (timeline or reading view) triggered the delete.
//
// Nothing below renders until the journal is open: while loading it shows
// a short status, and with a passcode set it shows the lock screen.
export function EntriesProvider({ children }) {
  const base = useEntries();
  const { announce } = useAnnouncer();
  const [pendingUndo, setPendingUndo] = useState(null);
  const { status, lockEnabled, lock } = base;

  const deleteEntry = useCallback(
    async (id) => {
      const removed = await base.deleteEntry(id);
      setPendingUndo(removed);
      announce(`Entry "${getEntryTitle(removed)}" deleted. Undo available.`, 'assertive');
      return removed;
    },
    [base, announce],
  );

  const undoDelete = useCallback(async () => {
    if (!pendingUndo) return;
    const entry = pendingUndo;
    setPendingUndo(null);
    await base.restoreEntry(entry);
    announce(`Entry "${getEntryTitle(entry)}" restored.`);
  }, [base, announce, pendingUndo]);

  const dismissUndo = useCallback(() => setPendingUndo(null), []);

  // Auto-lock: if the app sat in the background for a while, lock it on
  // return, so a phone left unlocked doesn't leave the journal open.
  useEffect(() => {
    if (!lockEnabled || status !== 'ready') return undefined;
    let hiddenAt = null;
    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt >= AUTO_LOCK_AFTER_MS) {
        lock();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [lockEnabled, status, lock]);

  useEffect(() => {
    if (status === 'locked') setPendingUndo(null);
  }, [status]);

  if (status === 'loading') {
    return (
      <StatusScreen title="Opening your journal…">
        <p className="sr-only" role="status">
          Loading
        </p>
      </StatusScreen>
    );
  }

  if (status === 'error') {
    return (
      <StatusScreen title="Your journal couldn't be opened">
        <p>
          This browser blocked access to its storage. That can happen in private browsing, or
          when site data is turned off. Try a normal window, or allow site data for this page.
        </p>
      </StatusScreen>
    );
  }

  if (status === 'locked') {
    return (
      <LockScreen
        onUnlock={base.unlock}
        onUnlockWithPasskey={base.passkeyEnabled ? base.unlockWithPasskey : null}
        onErase={base.eraseAndStartOver}
      />
    );
  }

  const value = { ...base, deleteEntry, pendingUndo, undoDelete, dismissUndo };

  return <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>;
}

export function useEntriesContext() {
  const ctx = useContext(EntriesContext);
  if (!ctx) throw new Error('useEntriesContext must be used within an EntriesProvider');
  return ctx;
}
