import { Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../Button/Button.jsx';
import { fetchForecast, forecastHeadsUp, latestPlace } from '../../lib/forecast.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './ForecastPrompt.module.css';

// The optional day plan loads only once a forecast is on screen.
const DayPlan = lazy(() => import('../GeminiHelpers/DayPlan.jsx').then((m) => ({ default: m.DayPlan })));

// "What's tomorrow like?" on the dashboard. Only looks the forecast up when
// asked, for the place of the latest entry that has one.
export function ForecastPrompt({ entries }) {
  const navigate = useNavigate();
  const { t, tOr } = useI18n();
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);
  // The forecast days as loaded, and when, kept so a day plan can use them
  // without asking the weather service again.
  const [forecast, setForecast] = useState(null);
  const place = latestPlace(entries);

  if (!place) return null;

  async function check() {
    setStatus('loading');
    try {
      const days = await fetchForecast(place);
      setForecast({ days, fetchedAt: Date.now() });
      setResult(forecastHeadsUp(days, entries));
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  // The kind of day picks the sentence; the lib's English is the fallback.
  const words = result && {
    headline: tOr(`forecast.${result.kind}.headline`, result.headline, {
      ...result.values,
      weather: tOr(`weather.${result.weatherType}`, result.weatherType).toLowerCase(),
    }),
    prompt: tOr(`forecast.${result.kind}.prompt`, result.prompt),
  };

  return (
    <section className={styles.card} aria-labelledby="forecast-heading">
      <div className={styles.head}>
        <h2 id="forecast-heading" className={styles.heading} tabIndex={-1}>
          {t('forecast.heading')}
        </h2>
        <Button type="button" variant="secondary" onClick={check} disabled={status === 'loading'}>
          {t(status === 'loading' ? 'forecast.checking' : status === 'done' ? 'forecast.again' : 'forecast.check')}
        </Button>
      </div>
      <p className={styles.sub}>
        {place.locationName ? t('forecast.forPlace', { place: place.locationName }) : t('forecast.forLatest')}
      </p>
      <div aria-live="polite">
        {status === 'done' && result && (
          <>
            <p className={styles.headline}>
              <span aria-hidden="true">{result.icon}</span> {words.headline}
            </p>
            <p className={styles.prompt}>{words.prompt}</p>
            <Button type="button" onClick={() => navigate('/new', { state: { prompt: words.prompt } })}>
              {t('forecast.write')}
            </Button>
          </>
        )}
        {status === 'error' && (
          <p className={styles.error} role="alert">
            {t('forecast.error')}
          </p>
        )}
      </div>
      {status === 'done' && forecast && (
        <Suspense fallback={null}>
          <DayPlan days={forecast.days} fetchedAt={forecast.fetchedAt} />
        </Suspense>
      )}
    </section>
  );
}
