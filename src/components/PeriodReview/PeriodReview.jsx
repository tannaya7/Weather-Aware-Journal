import { useMemo, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { PeriodFacts } from './PeriodFacts.jsx';
import { useReviewImage } from '../../hooks/useReviewImage.js';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { availablePeriods, drawPeriodReview, entriesInPeriod, periodSummary } from '../../lib/periodReview.js';
import styles from './PeriodReview.module.css';

const KINDS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

// A shareable image and a PDF for one week or month. The PDF is handed to
// the Export page's print section (onPrint) with a summary page up front.
export function PeriodReview({ entries, habits, goals, onPrint }) {
  const { announce } = useAnnouncer();
  const [kind, setKind] = useState('week');
  const [chosenKey, setChosenKey] = useState(null);

  const periods = useMemo(() => availablePeriods(entries, kind), [entries, kind]);
  const period = periods.find((p) => p.key === chosenKey) || periods[0];
  const summary = useMemo(
    () => (period ? periodSummary(entries, period, { habits, goals }) : null),
    [entries, period, habits, goals],
  );
  const image = useReviewImage(summary, drawPeriodReview);

  if (periods.length === 0) {
    return <p className={styles.text}>Write a few entries and your weekly and monthly reviews will appear here.</p>;
  }

  const fileName = `weather-journal-${period.key}-review.png`;
  const file = image && typeof File !== 'undefined' ? new File([image.blob], fileName, { type: 'image/png' }) : null;
  const canShare = Boolean(file && navigator.canShare?.({ files: [file] }));

  async function handleShare() {
    try {
      await navigator.share({ files: [file], title: `My ${period.label} in Weather Journal` });
    } catch (error) {
      if (error.name !== 'AbortError') announce("Sharing didn't work. Try downloading instead.", 'assertive');
    }
  }

  function handlePdf() {
    onPrint({
      title: kind === 'week' ? `My week, ${period.label}` : `My ${period.label}`,
      entries: entriesInPeriod(entries, period),
      intro: <PeriodFacts summary={summary} paper />,
    });
  }

  return (
    <div className={styles.review}>
      <div className={styles.controls}>
        <label htmlFor="periodKind">Review of a</label>
        <select
          id="periodKind"
          className={styles.select}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setChosenKey(null);
          }}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <label htmlFor="periodChoice">Period</label>
        <select
          id="periodChoice"
          className={styles.select}
          value={period.key}
          onChange={(e) => setChosenKey(e.target.value)}
        >
          {periods.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.body}>
        <div className={styles.preview}>
          {image ? (
            <img
              src={image.url}
              alt={`Your review of ${period.label}: ${count(summary.entries, 'entry', 'entries')} over ${count(
                summary.daysWritten,
                'day',
                'days',
              )}${summary.averageMood ? `, average mood ${summary.averageMood.label.toLowerCase()}` : ''}.`}
              className={styles.previewImage}
            />
          ) : (
            <p className={styles.text}>Drawing your review…</p>
          )}
        </div>

        <div className={styles.actions}>
          <PeriodFacts summary={summary} />
          {image && (
            <a className={styles.download} href={image.url} download={fileName}>
              Download review image
            </a>
          )}
          {canShare && (
            <Button type="button" variant="secondary" onClick={handleShare}>
              Share review…
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={handlePdf}>
            Save review as PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
