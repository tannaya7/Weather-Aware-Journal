import { useCallback, useState } from 'react';
import {
  fetchWeatherForCity,
  fetchWeatherForCoords,
  getCurrentPosition,
  isPastDate,
} from '../lib/weatherApi.js';
import { formatDateLong } from '../lib/dateFormat.js';
import { useAnnouncer } from '../context/AnnouncerContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';

// Wraps the weather lookup with loading/error/result state for the entry form.
// Both lookups take the entry's date: a past date gets that day's actual
// weather instead of today's.
export function useWeather(initialWeather = null) {
  const [weather, setWeather] = useState(initialWeather);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [statusMessage, setStatusMessage] = useState('');
  const { announce } = useAnnouncer();
  const { t, tOr, language } = useI18n();

  const run = useCallback(
    async (lookup, date) => {
      setStatus('loading');
      setStatusMessage(t('weatherStatus.fetching'));
      announce(t('weatherStatus.fetchingAnnounce'), 'polite');

      try {
        const result = await lookup();
        setWeather(result);
        setStatus('success');
        const place = result.locationName === 'Current location' ? t('weatherStatus.currentLocation') : result.locationName;
        setStatusMessage(
          isPastDate(date)
            ? t('weatherStatus.updatedOn', { place, date: formatDateLong(date, language) })
            : t('weatherStatus.updated', { place }),
        );
        const weatherWord = tOr(`weather.${result.weatherType}`, result.weatherType);
        announce(t('weatherStatus.announce', { weather: weatherWord, temperature: result.temperature }), 'polite');
        return result;
      } catch (error) {
        setStatus('error');
        // The lookup's messages are English; known ones have translations.
        setStatusMessage(error.message ? tOr(`weatherError.${error.message}`, error.message) : t('weatherStatus.failed'));
        announce(t('weatherStatus.failedAnnounce'), 'assertive');
        console.error(error);
        return null;
      }
    },
    [announce, t, tOr, language],
  );

  const fetchForCity = useCallback(
    (city, date) => {
      const trimmed = (city || '').trim();
      if (!trimmed) {
        setStatusMessage(t('weatherStatus.needCity'));
        return Promise.resolve(null);
      }
      return run(() => fetchWeatherForCity(trimmed, date), date);
    },
    [run, t],
  );

  const fetchForCurrentLocation = useCallback(
    (date) =>
      run(async () => {
        const { latitude, longitude } = await getCurrentPosition();
        return fetchWeatherForCoords(latitude, longitude, date);
      }, date),
    [run],
  );

  return { weather, status, statusMessage, fetchForCity, fetchForCurrentLocation };
}
