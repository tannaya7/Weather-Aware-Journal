import { Button } from '../Button/Button.jsx';
import styles from './WeatherBox.module.css';

export function WeatherBox({ location, onLocationChange, weather, status, statusMessage, onFetch }) {
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
          Enter a city name to fetch current weather data
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
      </div>

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

      <div className={styles.helper} aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
    </div>
  );
}
