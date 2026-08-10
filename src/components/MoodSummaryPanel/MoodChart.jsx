import { emojiForMood } from '../../lib/moods.js';
import styles from './MoodChart.module.css';

// Accessible bar chart: the visual bar is decorative (aria-hidden), the real
// information is exposed as text so screen readers get the actual counts.
export function MoodChart({ data }) {
  return (
    <ul className={styles.chart}>
      {data.map(({ mood, count, percent }) => (
        <li key={mood} className={styles.row}>
          <span>
            <span aria-hidden="true">{emojiForMood(mood)}</span> {mood}
          </span>
          <span className={styles.track} aria-hidden="true">
            <span className={styles.bar} style={{ width: `${percent}%` }} />
          </span>
          <span className={styles.count}>{count}</span>
        </li>
      ))}
    </ul>
  );
}
