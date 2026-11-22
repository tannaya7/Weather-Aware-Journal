import { useEffect } from 'react';
import { computeMoodCounts } from '../../lib/moodStats.js';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { MoodChart } from './MoodChart.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './MoodSummaryPanel.module.css';

export function MoodSummaryPanel({ entries, onClose }) {
  const { announce } = useAnnouncer();
  const { t } = useI18n();
  const containerRef = useFocusTrap(true);
  const moodData = computeMoodCounts(entries);

  useEffect(() => {
    announce(t('moodSummary.opened', { count: moodData.length }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    announce(t('moodSummary.closed'));
    onClose();
  }

  return (
    <div
      ref={containerRef}
      className={styles.panel}
      role="dialog"
      aria-modal="true"
      aria-label={t('moodSummary.label')}
    >
      <button type="button" className={styles.closeBtn} aria-label={t('moodSummary.close')} onClick={handleClose}>
        ×
      </button>
      <h3>{t('moodSummary.heading')}</h3>
      {moodData.length === 0 ? (
        <p className={styles.empty}>{t('moodSummary.empty')}</p>
      ) : (
        <MoodChart data={moodData} />
      )}
    </div>
  );
}
