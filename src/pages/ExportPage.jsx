import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '../components/Header/Header.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { Button } from '../components/Button/Button.jsx';
import { PrintJournal } from '../components/PrintJournal/PrintJournal.jsx';
import { BackupSection } from '../components/BackupSection/BackupSection.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { useAnnouncer } from '../context/AnnouncerContext.jsx';
import {
  REVIEW_SIZE,
  availableYears,
  drawYearReview,
  entriesInYear,
  yearSummary,
} from '../lib/yearReview.js';
import styles from './ExportPage.module.css';

const ALL = 'all';

function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// Renders the year-in-review card to a PNG blob (and a preview URL).
function useYearReviewImage(summary) {
  const [image, setImage] = useState(null); // { url, blob }

  useEffect(() => {
    if (!summary) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = REVIEW_SIZE.width;
    canvas.height = REVIEW_SIZE.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let cancelled = false;
    let url = null;
    drawYearReview(ctx, summary);
    canvas.toBlob((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setImage({ url, blob });
    }, 'image/png');

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [summary]);

  return image;
}

function YearInReview({ entries }) {
  const { announce } = useAnnouncer();
  const years = useMemo(() => availableYears(entries), [entries]);
  const [chosenYear, setYear] = useState(null);
  // Falls back to the latest year, including when entries arrive after the
  // page opened (e.g. restoring a backup into an empty journal).
  const year = years.includes(chosenYear) ? chosenYear : years[0];
  const summary = useMemo(() => (year ? yearSummary(entries, year) : null), [entries, year]);
  const image = useYearReviewImage(summary);
  const fileName = `weather-journal-${year}-in-review.png`;
  const file = image && typeof File !== 'undefined' ? new File([image.blob], fileName, { type: 'image/png' }) : null;
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));

  if (years.length === 0) {
    return <p className={styles.text}>Write a few entries and your year in review will appear here.</p>;
  }

  async function handleShare() {
    try {
      await navigator.share({ files: [file], title: `My ${year} in Weather Journal` });
    } catch (error) {
      if (error.name !== 'AbortError') announce("Sharing didn't work. Try downloading instead.", 'assertive');
    }
  }

  return (
    <div className={styles.review}>
      <div className={styles.controls}>
        <label htmlFor="reviewYear">Year</label>
        <select id="reviewYear" className={styles.select} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.reviewBody}>
        <div className={styles.preview}>
          {image ? (
            <img
              src={image.url}
              alt={`Your ${year} in review: ${count(summary.entries, 'entry', 'entries')} over ${count(
                summary.daysWritten,
                'day',
                'days',
              )}${
                summary.topMood ? `, mostly ${summary.topMood.mood}` : ''
              }.`}
              className={styles.previewImage}
            />
          ) : (
            <p className={styles.text}>Drawing your year…</p>
          )}
        </div>

        <div className={styles.actions}>
          <dl className={styles.facts}>
            <dt>Entries</dt>
            <dd>{summary.entries}</dd>
            <dt>Days written</dt>
            <dd>{summary.daysWritten}</dd>
            <dt>Longest streak</dt>
            <dd>
              {summary.longestStreak} {summary.longestStreak === 1 ? 'day' : 'days'}
            </dd>
            <dt>Words</dt>
            <dd>{summary.words.toLocaleString()}</dd>
          </dl>
          {image && (
            <a className={styles.download} href={image.url} download={fileName}>
              Download image
            </a>
          )}
          {canShare && (
            <Button type="button" variant="secondary" onClick={handleShare}>
              Share…
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PrintSection({ entries }) {
  const years = useMemo(() => availableYears(entries), [entries]);
  const [range, setRange] = useState(ALL);
  const [includePhotos, setIncludePhotos] = useState(true);
  const printing = useRef(false);

  const chosen = range === ALL ? entries : entriesInYear(entries, Number(range));
  const title = range === ALL ? 'My journal' : `My ${range}`;

  // Only the journal is printed while body has this class (see global.css).
  useEffect(() => {
    function done() {
      if (!printing.current) return;
      printing.current = false;
      document.body.classList.remove('printing-journal');
    }
    window.addEventListener('afterprint', done);
    return () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing-journal');
    };
  }, []);

  function handlePrint() {
    printing.current = true;
    document.body.classList.add('printing-journal');
    window.print();
  }

  return (
    <>
      <div className={styles.controls}>
        <label htmlFor="printRange">Entries</label>
        <select id="printRange" className={styles.select} value={range} onChange={(e) => setRange(e.target.value)}>
          <option value={ALL}>All entries</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <label className={styles.check}>
          <input type="checkbox" checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} />
          Include photos
        </label>
        <Button type="button" onClick={handlePrint} disabled={chosen.length === 0}>
          Print or save as PDF
        </Button>
      </div>
      <p className={styles.text}>
        In the print window, choose <strong>Save as PDF</strong> as the printer. The PDF isn&apos;t
        encrypted, even if your journal has a passcode.
      </p>
      <div className={styles.printPreview}>
        <PrintJournal entries={chosen} title={title} includePhotos={includePhotos} />
      </div>
    </>
  );
}

export function ExportPage() {
  const { entries } = useEntriesContext();

  return (
    <>
      <Header title="Export & share" icon="📤">
        <ThemeToggle />
      </Header>

      <div className={`container ${styles.page}`} id="main-content" role="main">
        <section className={styles.card} aria-labelledby="review-heading">
          <h2 id="review-heading" className={styles.heading}>
            Year in review
          </h2>
          <YearInReview entries={entries} />
        </section>

        <section className={styles.card} aria-labelledby="backup-heading">
          <h2 id="backup-heading" className={styles.heading}>
            Backups
          </h2>
          <BackupSection />
        </section>

        <section className={styles.card} aria-labelledby="print-heading">
          <h2 id="print-heading" className={styles.heading}>
            Print or save as PDF
          </h2>
          {entries.length === 0 ? (
            <p className={styles.text}>There&apos;s nothing to print yet.</p>
          ) : (
            <PrintSection entries={entries} />
          )}
        </section>
      </div>
    </>
  );
}
