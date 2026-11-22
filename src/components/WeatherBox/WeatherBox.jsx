import { Button } from '../Button/Button.jsx';
import { isPastDate } from '../../lib/weatherApi.js';
import { formatDateLong } from '../../lib/dateFormat.js';
import { SkyDetails } from '../SkyDetails/SkyDetails.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
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
  const { t, tOr, language } = useI18n();
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
        {t('weatherBox.label')} <span className={styles.optional}>{t('form.optional')}</span>
      </label>
      <div className={styles.row}>
        <input
          id="locationInput"
          className={`${styles.inputBox} ${styles.input}`}
          type="text"
          placeholder={t('weatherBox.placeholder')}
          autoComplete="off"
          aria-describedby="locationHelp"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <span id="locationHelp" className="sr-only">
          {past ? t('weatherBox.helpPast', { date: formatDateLong(date, language) }) : t('weatherBox.helpNow')}
        </span>
        <Button
          type="button"
          small
          variant="secondary"
          aria-label={t('weatherBox.fetchLabel')}
          onClick={onFetch}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? t('weatherBox.fetching') : t('weatherBox.add')}
        </Button>
        {canLocate && onUseLocation && (
          <Button
            type="button"
            small
            variant="secondary"
            aria-label={t('weatherBox.locateLabel')}
            onClick={onUseLocation}
            disabled={status === 'loading'}
          >
            <span aria-hidden="true">📍</span> {t('weatherBox.locate')}
          </Button>
        )}
      </div>
      {past && (
        <p className={styles.helper}>{t('weatherBox.pastHelper', { date: formatDateLong(date, language) })}</p>
      )}

      {weather && (
        <p className={styles.summary}>
          <span aria-hidden="true">{weather.icon}</span>
          <strong aria-label={t('weatherBox.temperature', { value: weather.temperature })}>{weather.temperature}</strong>
          <span>{tOr(`weather.${weather.weatherType}`, weather.weatherType)}</span>
          {weather.locationName && <span>{weather.locationName}</span>}
          {typeof weather.humidity === 'number' && (
            <span aria-label={t('weatherBox.humidity', { value: weather.humidity })}>
              <span aria-hidden="true">💧</span> {weather.humidity}%
            </span>
          )}
          {typeof weather.windSpeed === 'number' && (
            <span aria-label={t('weatherBox.wind', { value: weather.windSpeed })}>
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
