import { Link } from 'react-router-dom';
import { getDateBadgeParts } from '../../lib/dateFormat.js';
import { getEntryTitle } from '../../lib/entryTitle.js';
import { emojiForMood } from '../../lib/moods.js';
import { fontFamilyFor, weatherCardStyle } from '../../lib/entryStyle.js';
import { stripMarkdown, checklistProgress } from '../../lib/richText.js';
import { getEntryImages } from '../../lib/entryImages.js';
import { Highlight } from '../Highlight/Highlight.jsx';
import styles from './EntryCard.module.css';

export function EntryCard({ entry, onEdit, onDelete, highlight }) {
  const { day, weekday } = getDateBadgeParts(entry.date);
  const title = getEntryTitle(entry);
  const checks = checklistProgress(entry.content);
  const voiceCount = (entry.audio || []).length;
  const photoCount = getEntryImages(entry).length;

  return (
    <li className={styles.row} style={weatherCardStyle(entry)}>
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
        <p className={styles.preview}>
          <Highlight text={stripMarkdown(entry.content)} terms={highlight} />
        </p>
        {(checks.total > 0 || voiceCount > 0 || photoCount > 0) && (
          <p className={styles.extras}>
            {checks.total > 0 && (
              <span>
                ☑️ {checks.done}/{checks.total} done
              </span>
            )}
            {voiceCount > 0 && (
              <span>
                🎙️ {voiceCount} {voiceCount === 1 ? 'voice memo' : 'voice memos'}
              </span>
            )}
            {photoCount > 0 && (
              <span>
                📷 {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
              </span>
            )}
          </p>
        )}
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
