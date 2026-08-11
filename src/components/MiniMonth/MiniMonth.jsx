import { Link } from 'react-router-dom';
import { getMonthGridCells } from '../../lib/calendarStats.js';
import { monthNameLong, WEEKDAY_INITIALS } from '../../lib/dateFormat.js';
import { emojiForMood } from '../../lib/moods.js';
import styles from './MiniMonth.module.css';

const TODAY_KEY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

// One small month grid in the year view — plain day numbers, with a mood
// emoji standing in for the number on any day that has a journal entry.
export function MiniMonth({ year, month, dayMoodMap }) {
  const cells = getMonthGridCells(year, month);

  return (
    <div className={styles.month}>
      <h3 className={styles.heading}>{monthNameLong(month)}</h3>
      <div className={styles.grid}>
        {WEEKDAY_INITIALS.map((w, i) => (
          <span key={i} className={styles.weekday} aria-hidden="true">
            {w}
          </span>
        ))}

        {cells.map((cell, i) => {
          if (!cell) return <span key={i} className={styles.day} aria-hidden="true" />;

          const entry = dayMoodMap.get(cell.key);
          const isToday = cell.key === TODAY_KEY;

          if (!entry) {
            return (
              <span
                key={cell.key}
                className={`${styles.day} ${isToday ? styles.today : ''}`}
              >
                {cell.day}
              </span>
            );
          }

          return (
            <Link
              key={cell.key}
              to={`/entry/${entry.entryId}`}
              className={`${styles.day} ${styles.hasEntry} ${isToday ? styles.today : ''}`}
              aria-label={`${monthNameLong(month)} ${cell.day}: entry logged, mood ${entry.mood}`}
              title={`${monthNameLong(month)} ${cell.day} — ${entry.mood}`}
            >
              <span className={styles.emoji} aria-hidden="true">
                {emojiForMood(entry.mood)}
              </span>
              <span className={styles.dayNumber}>{cell.day}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
