import { mapWeatherCodeToType, iconForType } from './weatherApi.js';
import { parseTemperature } from './insights.js';

// A heads-up about tomorrow's weather and a writing prompt to go with it,
// from the Open-Meteo forecast. It only runs when the person asks, for the
// place of their latest located entry, so nothing is sent in the background.

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const DAY_MS = 86400000;
const RECENT_DAYS = 14;
const SNOW_LOOKBACK_DAYS = 120;

export async function fetchForecast({ latitude, longitude }) {
  const params =
    `latitude=${latitude}&longitude=${longitude}&timezone=auto&forecast_days=3` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max';
  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error('Could not load the forecast');
  const { daily } = await response.json();
  if (!daily?.time?.length) throw new Error('No forecast available for that place');

  return daily.time.map((date, i) => {
    const code = daily.weather_code?.[i];
    const weatherType = mapWeatherCodeToType(code);
    return {
      date,
      code,
      weatherType,
      icon: iconForType(weatherType),
      max: Math.round(daily.temperature_2m_max?.[i]),
      min: Math.round(daily.temperature_2m_min?.[i]),
      precipitation: daily.precipitation_sum?.[i] ?? 0,
      uv: daily.uv_index_max?.[i] ?? null,
    };
  });
}

// The latest entry that has a place, as { latitude, longitude, locationName }.
export function latestPlace(entries) {
  let best = null;
  for (const entry of entries) {
    if (typeof entry.latitude !== 'number' || typeof entry.longitude !== 'number') continue;
    const time = new Date(entry.date).getTime();
    if (isNaN(time)) continue;
    if (!best || time > best.time) best = { time, entry };
  }
  return best
    ? {
        latitude: best.entry.latitude,
        longitude: best.entry.longitude,
        locationName: best.entry.locationName || '',
      }
    : null;
}

// Average of the temperatures logged in the last two weeks, or null.
export function recentTemperature(entries, now = new Date()) {
  const temps = entries
    .filter((e) => {
      const t = new Date(e.date).getTime();
      return !isNaN(t) && now - t >= 0 && now - t <= RECENT_DAYS * DAY_MS;
    })
    .map((e) => parseTemperature(e.temperature))
    .filter((t) => t !== null);
  return temps.length >= 3 ? temps.reduce((s, t) => s + t, 0) / temps.length : null;
}

function hadRecentSnow(entries, now) {
  return entries.some((e) => {
    const t = new Date(e.date).getTime();
    return e.weatherType === 'Snow' && !isNaN(t) && now - t >= 0 && now - t <= SNOW_LOOKBACK_DAYS * DAY_MS;
  });
}

// Picks the most notable thing about tomorrow, or a plain summary if
// nothing stands out. `days` is [today, tomorrow, ...] from fetchForecast.
export function forecastHeadsUp(days, entries = [], now = new Date()) {
  const today = days[0];
  const tomorrow = days[1];
  if (!tomorrow) return null;

  const typical = recentTemperature(entries, now);
  const swing = today ? tomorrow.max - today.max : 0;
  const vsRecent = typical === null ? 0 : tomorrow.max - typical;
  const base = { icon: tomorrow.icon, weatherType: tomorrow.weatherType, max: tomorrow.max, min: tomorrow.min };

  if (tomorrow.code >= 95) {
    return {
      ...base,
      kind: 'storm',
      headline: 'A thunderstorm is forecast for tomorrow.',
      prompt: 'A storm is on its way. How do you feel when the weather turns loud?',
    };
  }
  if (tomorrow.weatherType === 'Snow' && !hadRecentSnow(entries, now)) {
    return {
      ...base,
      kind: 'first-snow',
      headline: 'Snow is forecast for tomorrow, the first in a while.',
      prompt: 'Snow is coming. What do you remember about the first snow of other winters?',
    };
  }
  if (tomorrow.max >= 32 || vsRecent >= 8) {
    return {
      ...base,
      kind: 'heat',
      headline: `Tomorrow gets hot: ${tomorrow.max}°C.`,
      prompt: 'A hot day ahead. How does heat change your energy and your plans?',
    };
  }
  if (tomorrow.min <= -5 || vsRecent <= -8) {
    return {
      ...base,
      kind: 'cold',
      headline: `Tomorrow turns cold: ${tomorrow.max}°C at best.`,
      prompt: 'A cold day ahead. What will keep you warm, inside and out?',
    };
  }
  if (tomorrow.precipitation >= 10) {
    return {
      ...base,
      kind: 'heavy-rain',
      headline: `Heavy rain is forecast for tomorrow (${Math.round(tomorrow.precipitation)} mm).`,
      prompt: 'A very wet day is coming. What would make a rainy day feel good?',
    };
  }
  if (today && ['Rain', 'Drizzle', 'Thunderstorm'].includes(today.weatherType) && tomorrow.weatherType === 'Clear sky') {
    return {
      ...base,
      kind: 'sun-returns',
      headline: 'The sun returns tomorrow after the rain.',
      prompt: 'After the rain, clear skies. What are you hoping to do with the sun?',
    };
  }
  if (Math.abs(swing) >= 8) {
    return {
      ...base,
      kind: 'swing',
      headline: `Tomorrow is ${Math.abs(swing)}°C ${swing > 0 ? 'warmer' : 'colder'} than today.`,
      prompt: 'The weather shifts tomorrow. How do sudden changes land for you?',
    };
  }
  return {
    ...base,
    kind: 'ordinary',
    headline: `Tomorrow: ${tomorrow.weatherType.toLowerCase()}, ${tomorrow.min}° to ${tomorrow.max}°C.`,
    prompt: 'What would make tomorrow a good day, whatever the weather does?',
  };
}
