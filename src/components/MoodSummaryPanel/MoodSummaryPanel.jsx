import { useEffect } from 'react';
import { computeMoodCounts } from '../../lib/moodStats.js';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { MoodChart } from './MoodChart.jsx';
import styles from './MoodSummaryPanel.module.css';

export function MoodSummaryPanel({ entries, onClose }) {
  const { announce } = useAnnouncer();
  const containerRef = useFocusTrap(true);
  const moodData = computeMoodCounts(entries);

  useEffect(() => {
    announce(`Mood summary opened. Showing ${moodData.length} different moods.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    announce('Mood tracker closed');
    onClose();
  }

  return (
    <div
      ref={containerRef}
      className={styles.panel}
      role="dialog"
      aria-modal="true"
      aria-label="Mood summary for your journal entries"
    >
      <button type="button" className={styles.closeBtn} aria-label="Close mood summary" onClick={handleClose}>
        ×
      </button>
      <h3>Mood summary</h3>
      {moodData.length === 0 ? (
        <p className={styles.empty}>No entries yet to analyse mood.</p>
      ) : (
        <MoodChart data={moodData} />
      )}
    </div>
  );
}
