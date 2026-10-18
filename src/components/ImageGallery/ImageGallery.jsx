import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEntryTitle } from '../../lib/entryTitle.js';
import { formatDateForCard } from '../../lib/dateFormat.js';
import { getEntryImages } from '../../lib/entryImages.js';
import styles from './ImageGallery.module.css';

// A separate "photo memories" strip for entries that have an attached
// image — deliberately kept out of the regular timeline cards, which never
// show images.
// With years of photos, only the latest are shown until you ask for more.
export const GALLERY_PAGE = 12;

export function ImageGallery({ entries }) {
  const [shown, setShown] = useState(GALLERY_PAGE);
  const withImages = useMemo(
    () =>
      entries
        .map((entry) => ({ entry, images: getEntryImages(entry) }))
        .filter(({ images }) => images.length > 0)
        .sort((a, b) => new Date(b.entry.date) - new Date(a.entry.date)),
    [entries],
  );

  if (withImages.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="snapshots-heading">
      <h2 id="snapshots-heading" className={styles.heading}>
        Snapshots
      </h2>
      <div className={styles.grid}>
        {withImages.slice(0, shown).map(({ entry, images }) => {
          const title = getEntryTitle(entry);
          const extra = images.length - 1;
          return (
            <Link
              key={entry.id}
              to={`/entry/${entry.id}`}
              className={styles.card}
              aria-label={`Read entry: ${title}${extra > 0 ? ` (${images.length} photos)` : ''}`}
            >
              <img src={images[0]} alt="" className={styles.image} loading="lazy" decoding="async" />
              {extra > 0 && (
                <span className={styles.more} aria-hidden="true">
                  +{extra}
                </span>
              )}
              <div className={styles.caption}>
                <p className={styles.excerpt}>{title}</p>
                <span className={styles.date}>{formatDateForCard(entry.date)}</span>
              </div>
            </Link>
          );
        })}
      </div>
      {withImages.length > shown && (
        <button type="button" className={styles.showMore} onClick={() => setShown((n) => n + GALLERY_PAGE * 2)}>
          Show more photos ({withImages.length - shown} more)
        </button>
      )}
    </section>
  );
}
