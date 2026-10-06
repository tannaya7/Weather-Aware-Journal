// Weather utilities: fetch live weather data for a city via the free Open-Meteo API.
// No API key required.

import { fetchSkyAt } from './sky.js';

const GEO_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
// Reanalysis data back to 1940, for entries about older days.
const ARCHIVE_BASE_URL = 'https://archive-api.open-meteo.com/v1/archive';
// Free, keyless, made for in-browser use; Open-Meteo has no reverse lookup.
const REVERSE_GEO_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

const HOURLY_FIELDS = 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m';
// The forecast API also serves recent past days, so the archive (which
// lags a few days behind) is only needed further back than this.
const FORECAST_PAST_DAYS = 90;
// Within this long of now, an entry is about "right now": use current weather.
const CURRENT_WINDOW_MS = 2 * 60 * 60 * 1000;

export function mapWeatherCodeToType(code) {
  if (code === 0) return 'Clear sky';
  if (code === 1 || code === 2 || code === 3) return 'Clouds';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 95) return 'Thunderstorm';
  return 'Unknown';
}

export function iconForType(type) {
  const value = (type || '').toLowerCase();
  if (value.includes('clear')) return '☀️';
  if (value.includes('cloud')) return '⛅';
  if (value.includes('rain') || value.includes('drizzle')) return '🌧️';
  if (value.includes('snow')) return '❄️';
  if (value.includes('thunder')) return '⛈️';
  if (value.includes('fog')) return '🌫️';
  return '⛅';
}

async function getJson(url, errorMessage) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(errorMessage);
  return response.json();
}

export async function geocodeCity(cityName) {
  const trimmed = (cityName || '').trim();
  if (!trimmed) {
    throw new Error('City name is required');
  }

  const geoData = await getJson(
    `${GEO_BASE_URL}?name=${encodeURIComponent(trimmed)}&count=1`,
    'Could not look up that location',
  );
  if (!geoData.results || !geoData.results.length) {
    throw new Error('No matching location found');
  }

  const place = geoData.results[0];
  return {
    latitude: place.latitude,
    longitude: place.longitude,
    locationName: place.name && place.country ? `${place.name}, ${place.country}` : place.name || trimmed,
  };
}

// Best effort: a place name for coordinates, or null.
export async function reverseGeocode(latitude, longitude) {
  try {
    const data = await getJson(
      `${REVERSE_GEO_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
      'Reverse geocoding failed',
    );
    const place = data.city || data.locality || data.principalSubdivision;
    if (!place) return null;
    return data.countryName ? `${place}, ${data.countryName}` : place;
  } catch {
    return null;
  }
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// "YYYY-MM-DD" and "YYYY-MM-DDTHH:00" in the entry's own local time, which
// is what Open-Meteo's hourly series uses with timezone=auto.
function localDayAndHour(date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return { day, hour: `${day}T${pad(date.getHours())}:00` };
}

function toWeather({ temperature, humidity, code, windSpeed }) {
  const weatherType = mapWeatherCodeToType(code);
  return {
    icon: iconForType(weatherType),
    temperature: `${Math.round(temperature)}°C`,
    weatherType,
    humidity: typeof humidity === 'number' ? humidity : undefined,
    windSpeed: typeof windSpeed === 'number' ? windSpeed : undefined,
  };
}

// True when `date` is far enough in the past to need historical weather.
export function isPastDate(date, now = new Date()) {
  const d = date ? new Date(date) : null;
  return Boolean(d && !isNaN(d) && now - d > CURRENT_WINDOW_MS);
}

// Weather at a place: current conditions, or — when `date` is in the past —
// what the weather actually was at that hour.
export async function fetchWeatherAt({ latitude, longitude, date, now = new Date() }) {
  // wind_speed_unit=ms: the app shows m/s, and Open-Meteo defaults to km/h.
  const where = `latitude=${latitude}&longitude=${longitude}&timezone=auto&wind_speed_unit=ms`;

  if (!isPastDate(date, now)) {
    const data = await getJson(
      `${WEATHER_BASE_URL}?${where}&current=${HOURLY_FIELDS}`,
      'Failed to fetch weather',
    );
    const current = data.current;
    if (!current) {
      throw new Error('No current weather data available');
    }
    return toWeather({
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      code: current.weather_code,
      windSpeed: current.wind_speed_10m,
    });
  }

  const when = new Date(date);
  const { day, hour } = localDayAndHour(when);
  const daysAgo = (now - when) / 86400000;
  const base = daysAgo <= FORECAST_PAST_DAYS ? WEATHER_BASE_URL : ARCHIVE_BASE_URL;
  const data = await getJson(
    `${base}?${where}&start_date=${day}&end_date=${day}&hourly=${HOURLY_FIELDS}`,
    'Failed to fetch past weather',
  );

  const hourly = data.hourly;
  const index = hourly?.time?.indexOf(hour) ?? -1;
  if (index < 0 || typeof hourly.temperature_2m[index] !== 'number') {
    throw new Error('No weather data for that date');
  }
  return toWeather({
    temperature: hourly.temperature_2m[index],
    humidity: hourly.relative_humidity_2m?.[index],
    code: hourly.weather_code[index],
    windSpeed: hourly.wind_speed_10m?.[index],
  });
}

// Weather for a city by name — current, or historical when `date` is past.
// Includes the coordinates, which the map uses.
// Sun, daylight, UV, and air quality alongside the weather; never fails.
function skyOrNothing(latitude, longitude, date) {
  return fetchSkyAt({ latitude, longitude, date }).catch(() => ({}));
}

export async function fetchWeatherForCity(cityName, date) {
  const place = await geocodeCity(cityName);
  const [weather, sky] = await Promise.all([
    fetchWeatherAt({ latitude: place.latitude, longitude: place.longitude, date }),
    skyOrNothing(place.latitude, place.longitude, date),
  ]);
  return { ...weather, ...sky, ...place };
}

// Weather where you are (from the browser's location), with a place name
// when one can be found.
export async function fetchWeatherForCoords(latitude, longitude, date) {
  const [weather, sky, locationName] = await Promise.all([
    fetchWeatherAt({ latitude, longitude, date }),
    skyOrNothing(latitude, longitude, date),
    reverseGeocode(latitude, longitude),
  ]);
  return { ...weather, ...sky, latitude, longitude, locationName: locationName || 'Current location' };
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser can't share your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? 'Location access is blocked. Allow it for this site, or type a city instead.'
              : "Couldn't find your location. Try again, or type a city instead.",
          ),
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  });
}
