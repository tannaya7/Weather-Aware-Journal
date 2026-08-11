import { computeMoodWeatherStats, insightText } from '../../lib/moodWeatherStats.js';
import { emojiForMood } from '../../lib/moods.js';
import { iconForType } from '../../lib/weatherApi.js';
import styles from './MoodWeatherChart.module.css';

// A sequential heatmap (weather x mood) using the app's own accent color as
// the single hue, light = few entries, dark/saturated = many — the standard
// "compare magnitude across a grid" form, plus a plain-language insight
// sentence computed from the same data so the pattern doesn't rely on
// reading the grid.
export function MoodWeatherChart({ entries }) {
  const stats = computeMoodWeatherStats(entries);
  const { weatherTypes, moods, matrix, maxCount } = stats;

  if (weatherTypes.length === 0 || moods.length === 0) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Mood &amp; Weather</h2>
        <div className={styles.card}>
          <p className={styles.empty}>
            Once you&apos;ve logged a few entries with both a mood and weather, this will
            show how they relate.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="mood-weather-heading">
      <h2 id="mood-weather-heading" className={styles.heading}>
        Mood &amp; Weather
      </h2>
      <div className={styles.card}>
        <p className={styles.insight}>{insightText(stats)}</p>

        <div className={styles.scroll}>
          <div
            className={styles.grid}
            role="table"
            aria-label="Entry count by weather and mood"
            style={{ gridTemplateColumns: `auto repeat(${moods.length}, 36px)` }}
          >
            <div role="row" style={{ display: 'contents' }}>
              <div className={styles.colHead} role="columnheader" aria-hidden="true" />
              {moods.map((mood) => (
                <div key={mood} className={styles.colHead} role="columnheader" title={mood}>
                  <span aria-hidden="true">{emojiForMood(mood)}</span>
                </div>
              ))}
            </div>

            {weatherTypes.map((weather) => (
              <div key={weather} role="row" style={{ display: 'contents' }}>
                <div className={styles.rowHead} role="rowheader">
                  <span aria-hidden="true">{iconForType(weather)}</span> {weather}
                </div>
                {moods.map((mood) => {
                  const count = matrix[weather][mood] || 0;
                  const pct = maxCount ? Math.round((count / maxCount) * 100) : 0;
                  return (
                    <div
                      key={mood}
                      role="cell"
                      className={styles.cell}
                      tabIndex={count > 0 ? 0 : -1}
                      title={`${weather} + ${mood}: ${count} ${count === 1 ? 'entry' : 'entries'}`}
                      aria-label={`${weather}, ${mood}: ${count} ${count === 1 ? 'entry' : 'entries'}`}
                      style={{
                        backgroundColor:
                          count === 0
                            ? 'var(--color-border)'
                            : `color-mix(in oklab, var(--color-accent) ${Math.max(pct, 12)}%, var(--color-surface))`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.legend}>
          <span>Fewer</span>
          <span className={styles.legendBar} aria-hidden="true" />
          <span>More entries</span>
        </div>

        <details className={styles.tableToggle}>
          <summary>View as table</summary>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Weather</th>
                <th scope="col">Mood</th>
                <th scope="col">Entries</th>
              </tr>
            </thead>
            <tbody>
              {weatherTypes.flatMap((weather) =>
                moods
                  .filter((mood) => matrix[weather][mood] > 0)
                  .map((mood) => (
                    <tr key={`${weather}-${mood}`}>
                      <td>{weather}</td>
                      <td>
                        {emojiForMood(mood)} {mood}
                      </td>
                      <td>{matrix[weather][mood]}</td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}
