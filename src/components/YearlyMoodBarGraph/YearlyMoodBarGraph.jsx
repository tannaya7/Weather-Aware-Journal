import styles from './YearlyMoodBarGraph.module.css';

// Horizontal bar per mood (fixed order, all 6 always shown even at zero) —
// "compare magnitude" is a single-hue job, same accent-bar treatment as the
// dashboard's mood tracker chart.
export function YearlyMoodBarGraph({ data }) {
  const maxCount = Math.max(1, ...data.map((d) => d.count));

  return (
    <ul className={styles.chart}>
      {data.map(({ mood, emoji, count }) => (
        <li key={mood} className={styles.row}>
          <span className={styles.label}>
            <span aria-hidden="true">{emoji}</span> {mood}
          </span>
          <span className={styles.track} aria-hidden="true">
            <span className={styles.bar} style={{ width: `${(count / maxCount) * 100}%` }} />
          </span>
          <span className={styles.count}>{count}</span>
        </li>
      ))}
    </ul>
  );
}
