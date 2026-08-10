import { useCallback, useState } from 'react';
import { fetchWeatherForCity } from '../lib/weatherApi.js';
import { useAnnouncer } from '../context/AnnouncerContext.jsx';

// Wraps the weather lookup with loading/error/result state for the entry form.
export function useWeather(initialWeather = null) {
  const [weather, setWeather] = useState(initialWeather);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [statusMessage, setStatusMessage] = useState('');
  const { announce } = useAnnouncer();

  const fetchForCity = useCallback(
    async (city) => {
      const trimmed = (city || '').trim();
      if (!trimmed) {
        setStatusMessage('Enter a city name to fetch the weather.');
        return null;
      }

      setStatus('loading');
      setStatusMessage('Fetching weather…');
      announce('Fetching weather data...', 'polite');

      try {
        const result = await fetchWeatherForCity(trimmed);
        setWeather(result);
        setStatus('success');
        setStatusMessage(`Weather updated for ${result.locationName}.`);
        announce(`Weather updated. ${result.weatherType}, ${result.temperature}`, 'polite');
        return result;
      } catch (error) {
        setStatus('error');
        setStatusMessage('Could not fetch weather. Please try again.');
        announce('Weather fetch failed. Please try again.', 'assertive');
        console.error(error);
        return null;
      }
    },
    [announce],
  );

  return { weather, status, statusMessage, fetchForCity };
}
