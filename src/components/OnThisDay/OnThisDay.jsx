import { Link } from 'react-router-dom';
import { onThisDay } from '../../lib/insights.js';
import { getEntryTitle } from '../../lib/entryTitle.js';
import { emojiForMood } from '../../lib/moods.js';
import styles from './OnThisDay.module.css';

const MAX_SHOWN = 3;

// "What were you doing a year ago today?" Hidden unless there's a match.
export function OnThisDay({ entries, today = new Date() }) {
  const memories = onThisDay(entries, today);
  if (memories.length === 0) return null;

  return (
    <section className={styles.card} aria-labelledby="on-this-day-heading">
      <h2 id="on-this-day-heading" className={styles.heading}>
        <span aria-hidden="true">🕰️</span> On this day
      </h2>
      <ul className={styles.list}>
        {memories.slice(0, MAX_SHOWN).map(({ entry, yearsAgo }) => (
          <li key={entry.id}>
            <Link to={`/entry/${entry.id}`} className={styles.link}>
              <span className={styles.when}>
                {yearsAgo === 1 ? '1 year ago' : `${yearsAgo} years ago`}
              </span>
              <span className={styles.title}>
                {entry.mood && <span aria-hidden="true">{emojiForMood(entry.mood)} </span>}
                {getEntryTitle(entry)}
              </span>
              {entry.weatherIcon && (
                <span className={styles.weather}>
                  <span aria-hidden="true">{entry.weatherIcon}</span> {entry.temperature}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {memories.length > MAX_SHOWN && (
        <p className={styles.more}>and {memories.length - MAX_SHOWN} more from this day</p>
      )}
    </section>
  );
}
