import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { backfillWeather, entriesMissingWeather } from '../../lib/weatherBackfill.js';
import styles from './WeatherBackfill.module.css';

function entriesCount(n) {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`;
}

// Settings tool: look up the real weather for older entries that have none.
export function WeatherBackfill() {
  const { entries, updateEntry } = useEntriesContext();
  const { announce } = useAnnouncer();
  const missing = useMemo(() => entriesMissingWeather(entries), [entries]);
  const withoutPlace = missing.filter((e) => !e.locationName && typeof e.latitude !== 'number').length;

  const [city, setCity] = useState('');
  const [progress, setProgress] = useState(null); // { done, total } while running
  const [result, setResult] = useState('');
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleStart() {
    const controller = new AbortController();
    abortRef.current = controller;
    const toFill = missing;
    setResult('');
    setProgress({ done: 0, total: toFill.length });

    const summary = await backfillWeather(toFill, {
      fallbackCity: city,
      signal: controller.signal,
      onResult: (id, data) => updateEntry(id, data),
      onProgress: (done, total) => setProgress({ done, total }),
    });

    if (controller.signal.aborted) return;
    setProgress(null);
    const parts = [`Added weather to ${entriesCount(summary.updated)}.`];
    if (summary.skipped) parts.push(`${summary.skipped} had no place to look up.`);
    if (summary.failed) parts.push(`${summary.failed} couldn't be looked up.`);
    const message = parts.join(' ');
    setResult(message);
    announce(message);
  }

  if (missing.length === 0 && !result) {
    return <p className={styles.text}>Every entry has its weather. Nothing to fill in.</p>;
  }

  return (
    <div className={styles.backfill}>
      {missing.length > 0 && (
        <p className={styles.text}>
          {entriesCount(missing.length)} {missing.length === 1 ? 'has' : 'have'} no weather. This looks up what the weather actually was on each one&apos;s date, at its
          saved place.
        </p>
      )}

      {withoutPlace > 0 && (
        <div className={styles.field}>
          <label htmlFor="backfillCity">
            City for the {withoutPlace} without a place <span>(optional)</span>
          </label>
          <input
            id="backfillCity"
            className={styles.input}
            value={city}
            placeholder="e.g. Hyderabad"
            onChange={(e) => setCity(e.target.value)}
            disabled={Boolean(progress)}
          />
        </div>
      )}

      {progress ? (
        <p className={styles.progress} role="status">
          Looking up weather… {progress.done} of {progress.total}
        </p>
      ) : (
        missing.length > 0 && (
          <Button type="button" onClick={handleStart}>
            Fill in missing weather
          </Button>
        )
      )}

      {result && (
        <p className={styles.result} role="status">
          {result}
        </p>
      )}
    </div>
  );
}
