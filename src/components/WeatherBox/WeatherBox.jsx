import { Button } from '../Button/Button.jsx';
import { isPastDate } from '../../lib/weatherApi.js';
import { formatDateLong } from '../../lib/dateFormat.js';
import { SkyDetails } from '../SkyDetails/SkyDetails.jsx';
import styles from './WeatherBox.module.css';

export function WeatherBox({
  location,
  onLocationChange,
  weather,
  status,
  statusMessage,
  onFetch,
  onUseLocation,
  date,
}) {
  const past = isPastDate(date);
  const canLocate = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onFetch();
    }
  }

  return (
    <div className={styles.field}>
      <label className={styles.quietLabel} htmlFor="locationInput">
        Weather <span className={styles.optional}>(optional)</span>
      </label>
      <div className={styles.row}>
        <input
          id="locationInput"
          className={`${styles.inputBox} ${styles.input}`}
          type="text"
          placeholder="Add a city to remember the weather"
          autoComplete="off"
          aria-describedby="locationHelp"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <span id="locationHelp" className="sr-only">
          {past
            ? `Enter a city name to look up the weather on ${formatDateLong(date)}`
            : 'Enter a city name to fetch current weather data'}
        </span>
        <Button
          type="button"
          small
          variant="secondary"
          aria-label="Fetch weather data for entered location"
          onClick={onFetch}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Fetching…' : 'Add weather'}
        </Button>
        {canLocate && onUseLocation && (
          <Button
            type="button"
            small
            variant="secondary"
            aria-label="Use my current location for the weather"
            onClick={onUseLocation}
            disabled={status === 'loading'}
          >
            <span aria-hidden="true">📍</span> Use my location
          </Button>
        )}
      </div>
      {past && (
        <p className={styles.helper}>
          Looks up the actual weather on {formatDateLong(date)}, at that time of day.
        </p>
      )}

      {weather && (
        <p className={styles.summary}>
          <span aria-hidden="true">{weather.icon}</span>
          <strong aria-label={`Temperature ${weather.temperature}`}>{weather.temperature}</strong>
          <span>{weather.weatherType}</span>
          {weather.locationName && <span>{weather.locationName}</span>}
          {typeof weather.humidity === 'number' && (
            <span aria-label={`Humidity ${weather.humidity} percent`}>
              <span aria-hidden="true">💧</span> {weather.humidity}%
            </span>
          )}
          {typeof weather.windSpeed === 'number' && (
            <span aria-label={`Wind speed ${weather.windSpeed} meters per second`}>
              <span aria-hidden="true">💨</span> {weather.windSpeed} m/s
            </span>
          )}
        </p>
      )}
      {weather && <SkyDetails data={weather} date={date} />}

      <div className={styles.helper} aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
    </div>
  );
}
