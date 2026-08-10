import styles from './UndoToast.module.css';

export function UndoToast({ visible, onUndo, onClose }) {
  if (!visible) return null;

  return (
    <div className={styles.toast} role="status">
      <span>Entry deleted.</span>
      <button type="button" aria-label="Undo delete entry" onClick={onUndo}>
        Undo
      </button>
      <button
        type="button"
        className={styles.closeBtn}
        aria-label="Close undo notification"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
