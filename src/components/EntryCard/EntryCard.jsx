import { Link } from 'react-router-dom';
import { getDateBadgeParts } from '../../lib/dateFormat.js';
import { getEntryTitle } from '../../lib/entryTitle.js';
import { emojiForMood } from '../../lib/moods.js';
import { fontFamilyFor } from '../../lib/entryStyle.js';
import styles from './EntryCard.module.css';

const BACKGROUND_CLASS = {
  peach: styles.peach,
  'light-blue': styles.lightBlue,
  dark: styles.dark,
};

export function EntryCard({ entry, onEdit, onDelete }) {
  const extraClass = BACKGROUND_CLASS[entry.background] || '';
  const { day, weekday } = getDateBadgeParts(entry.date);
  const title = getEntryTitle(entry);

  return (
    <li className={[styles.row, extraClass].filter(Boolean).join(' ')}>
      <div className={styles.dateBadge} aria-hidden="true">
        <span className={styles.day}>{day}</span>
        <span className={styles.weekday}>{weekday}</span>
      </div>

      <Link
        to={`/entry/${entry.id}`}
        className={styles.linkArea}
        aria-label={`Read entry: ${title}`}
        style={{ fontFamily: fontFamilyFor(entry) }}
      >
        <div className={styles.metaRow}>
          {entry.mood && (
            <span>
              <span aria-hidden="true">{emojiForMood(entry.mood)}</span> {entry.mood}
            </span>
          )}
          {entry.weatherIcon && (
            <span>
              <span aria-hidden="true">{entry.weatherIcon}</span> {entry.temperature}
              {entry.locationName ? ` · ${entry.locationName}` : ''}
            </span>
          )}
        </div>
        <p className={styles.preview}>{entry.content}</p>
        {entry.tags?.length > 0 && (
          <div className={styles.tags}>
            {entry.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </Link>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconBtn}
          aria-label={`Edit entry "${title}"`}
          onClick={() => onEdit(entry.id)}
        >
          Edit
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.deleteBtn}`}
          aria-label={`Delete entry "${title}"`}
          onClick={() => onDelete(entry.id)}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
