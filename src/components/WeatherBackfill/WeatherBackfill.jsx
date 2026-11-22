import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { backfillWeather, entriesMissingWeather } from '../../lib/weatherBackfill.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './WeatherBackfill.module.css';

// Settings tool: look up the real weather for older entries that have none.
export function WeatherBackfill() {
  const { entries, updateEntry } = useEntriesContext();
  const { announce } = useAnnouncer();
  const { t } = useI18n();
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
    const parts = [t('backfill.added', { count: summary.updated })];
    if (summary.skipped) parts.push(t('backfill.skipped', { count: summary.skipped }));
    if (summary.failed) parts.push(t('backfill.failed', { count: summary.failed }));
    const message = parts.join(' ');
    setResult(message);
    announce(message);
  }

  if (missing.length === 0 && !result) {
    return <p className={styles.text}>{t('backfill.allDone')}</p>;
  }

  return (
    <div className={styles.backfill}>
      {missing.length > 0 && (
        <p className={styles.text}>{t('backfill.missing', { count: missing.length })}</p>
      )}

      {withoutPlace > 0 && (
        <div className={styles.field}>
          <label htmlFor="backfillCity">
            {t('backfill.cityLabel', { count: withoutPlace })} <span>{t('form.optional')}</span>
          </label>
          <input
            id="backfillCity"
            className={styles.input}
            value={city}
            placeholder={t('backfill.cityPlaceholder')}
            onChange={(e) => setCity(e.target.value)}
            disabled={Boolean(progress)}
          />
        </div>
      )}

      {progress ? (
        <p className={styles.progress} role="status">
          {t('backfill.progress', { done: progress.done, total: progress.total })}
        </p>
      ) : (
        missing.length > 0 && (
          <Button type="button" onClick={handleStart}>
            {t('backfill.start')}
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
