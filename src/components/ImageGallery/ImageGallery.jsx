import { Link } from 'react-router-dom';
import { getEntryTitle } from '../../lib/entryTitle.js';
import { formatDateForCard } from '../../lib/dateFormat.js';
import styles from './ImageGallery.module.css';

// A separate "photo memories" strip for entries that have an attached
// image — deliberately kept out of the regular timeline cards, which never
// show images.
export function ImageGallery({ entries }) {
  const withImages = entries
    .filter((entry) => entry.image)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (withImages.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="snapshots-heading">
      <h2 id="snapshots-heading" className={styles.heading}>
        Snapshots
      </h2>
      <div className={styles.grid}>
        {withImages.map((entry) => {
          const title = getEntryTitle(entry);
          return (
            <Link
              key={entry.id}
              to={`/entry/${entry.id}`}
              className={styles.card}
              aria-label={`Read entry: ${title}`}
            >
              <img src={entry.image} alt="" className={styles.image} />
              <div className={styles.caption}>
                <p className={styles.excerpt}>{title}</p>
                <span className={styles.date}>{formatDateForCard(entry.date)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
