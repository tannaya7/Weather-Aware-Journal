import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../Button/Button.jsx';
import { fetchForecast, forecastHeadsUp, latestPlace } from '../../lib/forecast.js';
import styles from './ForecastPrompt.module.css';

// "What's tomorrow like?" on the dashboard. Only looks the forecast up when
// asked, for the place of the latest entry that has one.
export function ForecastPrompt({ entries }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const place = latestPlace(entries);

  if (!place) return null;

  async function check() {
    setStatus('loading');
    try {
      const days = await fetchForecast(place);
      setResult(forecastHeadsUp(days, entries));
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  return (
    <section className={styles.card} aria-labelledby="forecast-heading">
      <div className={styles.head}>
        <h2 id="forecast-heading" className={styles.heading}>
          Tomorrow&apos;s weather
        </h2>
        <Button type="button" variant="secondary" onClick={check} disabled={status === 'loading'}>
          {status === 'loading' ? 'Checking…' : status === 'done' ? 'Check again' : 'Check the forecast'}
        </Button>
      </div>
      <p className={styles.sub}>
        {place.locationName ? `For ${place.locationName}, the place of your latest entry.` : 'For the place of your latest entry.'}
      </p>
      <div aria-live="polite">
        {status === 'done' && result && (
          <>
            <p className={styles.headline}>
              <span aria-hidden="true">{result.icon}</span> {result.headline}
            </p>
            <p className={styles.prompt}>{result.prompt}</p>
            <Button type="button" onClick={() => navigate('/new', { state: { prompt: result.prompt } })}>
              Write about it
            </Button>
          </>
        )}
        {status === 'error' && (
          <p className={styles.error} role="alert">
            Could not load the forecast. Check your connection and try again.
          </p>
        )}
      </div>
    </section>
  );
}
