import { formatDateLong } from '../../lib/dateFormat.js';
import { getEntryTitle } from '../../lib/entryTitle.js';
import { emojiForMood } from '../../lib/moods.js';
import { getEntryImages } from '../../lib/entryImages.js';
import { RichText } from '../RichText/RichText.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './PrintJournal.module.css';

// The journal laid out for paper / PDF: a cover, then every entry oldest
// first, each kept on one page where it fits.
// `intro` (optional) is shown on its own page after the cover.
export function PrintJournal({ entries, title, includePhotos, intro }) {
  const { t, tOr, language } = useI18n();
  const ordered = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div className={`print-area ${styles.journal}`}>
      <header className={styles.cover}>
        <p className={styles.brand}>🌥️ {t('print.brand')}</p>
        <h1 className={styles.coverTitle}>{title}</h1>
        <p className={styles.coverMeta}>
          {t('print.count', { count: ordered.length })}
          {ordered.length > 0 &&
            ` · ${formatDateLong(ordered[0].date, language)} – ${formatDateLong(ordered[ordered.length - 1].date, language)}`}
        </p>
      </header>

      {intro && <section className={styles.intro}>{intro}</section>}

      {ordered.map((entry) => {
        const images = includePhotos ? getEntryImages(entry) : [];
        return (
          <article key={entry.id} className={styles.entry}>
            <p className={styles.date}>{formatDateLong(entry.date, language)}</p>
            <h2 className={styles.title}>{getEntryTitle(entry)}</h2>
            <p className={styles.meta}>
              {entry.mood && (
                <span>
                  {emojiForMood(entry.mood)} {tOr(`mood.${entry.mood}`, entry.mood)}
                </span>
              )}
              {entry.weatherType && (
                <span>
                  {entry.weatherIcon} {entry.temperature} {tOr(`weather.${entry.weatherType}`, entry.weatherType)}
                </span>
              )}
              {entry.locationName && <span>📍 {entry.locationName}</span>}
              {entry.tags?.length > 0 && <span>{entry.tags.map((t) => `#${t}`).join(' ')}</span>}
            </p>
            <div className={styles.content}>
              <RichText text={entry.content} />
            </div>
            {entry.audio?.length > 0 && (
              <p className={styles.meta}>
                🎙️ {t('print.voice', { count: entry.audio.length })}
              </p>
            )}
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
