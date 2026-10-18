import { fetchWeatherAt, geocodeCity } from './weatherApi.js';
import { fetchSkyAt, pickSky } from './sky.js';

// Entries that have a date but no weather yet.
export function entriesMissingWeather(entries) {
  return entries.filter((entry) => !entry.weatherType && entry.date && !isNaN(new Date(entry.date)));
}

// Looks up the actual weather for each entry on its own date, at the entry's
// saved location (or `fallbackCity` when it has none). Runs one at a time to
// stay gentle on the free API, and hands each result to onResult as it
// arrives, so progress is kept even if the page is left halfway.
export async function backfillWeather(
  entries,
  {
    fallbackCity = '',
    onResult,
    onProgress,
    signal,
    fetchAt = fetchWeatherAt,
    geocode = geocodeCity,
    fetchSky = fetchSkyAt,
  } = {},
) {
  const places = new Map(); // name -> Promise<place>, one lookup per place
  const placeFor = (name) => {
    const key = name.trim().toLowerCase();
    if (!places.has(key)) places.set(key, geocode(name));
    return places.get(key);
  };

  const summary = { updated: 0, skipped: 0, failed: 0 };

  for (const [index, entry] of entries.entries()) {
    if (signal?.aborted) break;

    try {
      let place;
      if (typeof entry.latitude === 'number' && typeof entry.longitude === 'number') {
        place = { latitude: entry.latitude, longitude: entry.longitude, locationName: entry.locationName };
      } else {
        const name = entry.locationName || fallbackCity;
        if (!name.trim()) {
          summary.skipped += 1;
          onProgress?.(index + 1, entries.length);
          continue;
        }
        place = await placeFor(name);
      }

      const at = { latitude: place.latitude, longitude: place.longitude, date: entry.date };
      const [weather, sky] = await Promise.all([fetchAt(at), fetchSky(at).catch(() => ({}))]);
      await onResult?.(entry.id, {
        weatherIcon: weather.icon,
        temperature: weather.temperature,
        weatherType: weather.weatherType,
        humidity: weather.humidity,
        windSpeed: weather.windSpeed,
        locationName: entry.locationName || place.locationName,
        latitude: place.latitude,
        longitude: place.longitude,
        ...pickSky(sky),
      });
      summary.updated += 1;
    } catch (error) {
      console.warn(`Could not fill in weather for entry ${entry.id}`, error);
      summary.failed += 1;
    }
    onProgress?.(index + 1, entries.length);
  }

  return summary;
}
