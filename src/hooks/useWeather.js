import { useCallback, useState } from 'react';
import {
  fetchWeatherForCity,
  fetchWeatherForCoords,
  getCurrentPosition,
  isPastDate,
} from '../lib/weatherApi.js';
import { formatDateLong } from '../lib/dateFormat.js';
import { useAnnouncer } from '../context/AnnouncerContext.jsx';

// Wraps the weather lookup with loading/error/result state for the entry form.
// Both lookups take the entry's date: a past date gets that day's actual
// weather instead of today's.
export function useWeather(initialWeather = null) {
  const [weather, setWeather] = useState(initialWeather);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [statusMessage, setStatusMessage] = useState('');
  const { announce } = useAnnouncer();

  const run = useCallback(
    async (lookup, date) => {
      setStatus('loading');
      setStatusMessage('Fetching weather…');
      announce('Fetching weather data...', 'polite');

      try {
        const result = await lookup();
        setWeather(result);
        setStatus('success');
        const when = isPastDate(date) ? ` on ${formatDateLong(date)}` : '';
        setStatusMessage(`Weather updated for ${result.locationName}${when}.`);
        announce(`Weather updated. ${result.weatherType}, ${result.temperature}`, 'polite');
        return result;
      } catch (error) {
        setStatus('error');
        setStatusMessage(error.message || 'Could not fetch weather. Please try again.');
        announce('Weather fetch failed. Please try again.', 'assertive');
        console.error(error);
        return null;
      }
    },
    [announce],
  );

  const fetchForCity = useCallback(
    (city, date) => {
      const trimmed = (city || '').trim();
      if (!trimmed) {
        setStatusMessage('Enter a city name to fetch the weather.');
        return Promise.resolve(null);
      }
      return run(() => fetchWeatherForCity(trimmed, date), date);
    },
    [run],
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
