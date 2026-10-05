import { computeStreaks } from '../../lib/streaks.js';
import styles from './StreakCard.module.css';

function days(n) {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

// Current and longest run of consecutive days with an entry. Hidden until
// there's at least one dated entry.
export function StreakCard({ entries, today = new Date() }) {
  const { current, longest, wroteToday } = computeStreaks(entries, today);
  if (longest === 0) return null;

  return (
    <section className={styles.card} aria-label="Writing streak">
      <span className={styles.flame} aria-hidden="true">
        {current > 0 ? '🔥' : '🕯️'}
      </span>
      <div>
        <p className={styles.current}>
          {current > 0 ? `${current}-day streak` : 'No streak right now'}
        </p>
        <p className={styles.detail}>
          Longest: {days(longest)}
          {current > 0 && !wroteToday && ' · Write today to keep it going'}
          {current === 0 && ' · Write today to start a new one'}
        </p>
      </div>
    </section>
  );
}
