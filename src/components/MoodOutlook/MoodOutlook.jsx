import { useMemo } from 'react';
import { describeMood } from '../../lib/insights.js';
import { moodOutlook } from '../../lib/moodOutlook.js';
import styles from './MoodOutlook.module.css';

const TREND_TEXT = {
  rising: 'Your mood has been rising over the last four weeks.',
  falling: 'Your mood has been sliding over the last four weeks.',
  steady: 'Your mood has been steady over the last four weeks (no clear rise or fall).',
  unknown: 'Not enough recent entries with a mood to see a direction yet.',
};

function barPercent(average) {
  return Math.round(((average + 2) / 4) * 100); // scores run from -2 to +2
}

// Direction of mood and the weekday rhythm, with a "tomorrow" tendency only
// when it beats just using your overall average.
export function MoodOutlook({ entries, today }) {
  const outlook = useMemo(() => moodOutlook(entries, today), [entries, today]);

  return (
    <section className={styles.card} aria-labelledby="outlook-heading">
      <h2 id="outlook-heading" className={styles.heading}>
        Mood outlook
      </h2>
      {!outlook.enough ? (
        <p className={styles.empty}>
          Log a mood on at least {outlook.needed} different days to see your trend and weekday
          rhythm. You have {outlook.moodDays}.
        </p>
      ) : (
        <>
          <p className={styles.trend}>{TREND_TEXT[outlook.trend.direction]}</p>

          {outlook.tomorrow ? (
            <p className={styles.tomorrow}>
              <strong>Tomorrow ({outlook.tomorrow.weekday})</strong> tends to be{' '}
              <strong>{outlook.tomorrow.label.toLowerCase()}</strong> for you, going by{' '}
              {outlook.tomorrow.basedOn} past {outlook.tomorrow.weekday}s. A tendency, not a
              prediction.
            </p>
          ) : (
            <p className={styles.sub}>
              Your weekdays do not differ enough to predict one day from another. Using your overall
              average does just as well.
            </p>
          )}

          <h3 className={styles.sectionHeading}>By weekday</h3>
          <ul className={styles.days}>
            {outlook.weekdays.map((w) => (
              <li key={w.weekday} className={styles.day}>
                <span className={styles.dayName}>{w.weekday}</span>
                {w.average === null ? (
                  <span className={styles.dayNone}>No entries</span>
                ) : (
                  <>
                    <span
                      className={styles.track}
                      role="img"
                      aria-label={`${describeMood(w.average)}, ${w.days} ${w.days === 1 ? 'day' : 'days'}`}
                    >
                      <span className={styles.fill} style={{ width: `${barPercent(w.average)}%` }} />
                    </span>
                    <span className={styles.dayValue}>
                      {describeMood(w.average)} <span className={styles.count}>({w.days})</span>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
