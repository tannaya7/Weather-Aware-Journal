import { formatDateLong } from '../../lib/dateFormat.js';
import { getEntryTitle } from '../../lib/entryTitle.js';
import { emojiForMood } from '../../lib/moods.js';
import { getEntryImages } from '../../lib/entryImages.js';
import styles from './PrintJournal.module.css';

// The journal laid out for paper / PDF: a cover, then every entry oldest
// first, each kept on one page where it fits.
export function PrintJournal({ entries, title, includePhotos }) {
  const ordered = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div className={`print-area ${styles.journal}`}>
      <header className={styles.cover}>
        <p className={styles.brand}>🌥️ Weather Journal</p>
        <h1 className={styles.coverTitle}>{title}</h1>
        <p className={styles.coverMeta}>
          {ordered.length} {ordered.length === 1 ? 'entry' : 'entries'}
          {ordered.length > 0 &&
            ` · ${formatDateLong(ordered[0].date)} – ${formatDateLong(ordered[ordered.length - 1].date)}`}
        </p>
      </header>

      {ordered.map((entry) => {
        const images = includePhotos ? getEntryImages(entry) : [];
        return (
          <article key={entry.id} className={styles.entry}>
            <p className={styles.date}>{formatDateLong(entry.date)}</p>
            <h2 className={styles.title}>{getEntryTitle(entry)}</h2>
            <p className={styles.meta}>
              {entry.mood && (
                <span>
                  {emojiForMood(entry.mood)} {entry.mood}
                </span>
              )}
              {entry.weatherType && (
                <span>
                  {entry.weatherIcon} {entry.temperature} {entry.weatherType}
                </span>
              )}
              {entry.locationName && <span>📍 {entry.locationName}</span>}
              {entry.tags?.length > 0 && <span>{entry.tags.map((t) => `#${t}`).join(' ')}</span>}
            </p>
            <div className={styles.content}>{entry.content}</div>
            {images.length > 0 && (
              <div className={styles.photos}>
                {images.map((src, i) => (
                  <img key={i} src={src} alt="" className={styles.photo} />
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
