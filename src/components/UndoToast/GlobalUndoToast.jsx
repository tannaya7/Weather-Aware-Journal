import { useEffect } from 'react';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { UndoToast } from './UndoToast.jsx';

// Renders the delete/undo toast once at the app root so it works regardless
// of which route triggered the delete (timeline row or the reading page).
export function GlobalUndoToast() {
  const { pendingUndo, undoDelete, dismissUndo } = useEntriesContext();

  useEffect(() => {
    if (!pendingUndo) return undefined;
    function handleKeyDown(e) {
      if (e.key === 'Escape') dismissUndo();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pendingUndo, dismissUndo]);

  return <UndoToast visible={Boolean(pendingUndo)} onUndo={undoDelete} onClose={dismissUndo} />;
}
