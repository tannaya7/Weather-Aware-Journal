// Weather utilities: fetch live weather data for a city via the free Open-Meteo API.
// No API key required.

const GEO_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

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

export async function fetchWeatherForCity(cityName) {
  const trimmed = cityName.trim();
  if (!trimmed) {
    throw new Error('City name is required');
  }

  const geoResponse = await fetch(`${GEO_BASE_URL}?name=${encodeURIComponent(trimmed)}&count=1`);
  if (!geoResponse.ok) {
    throw new Error('Could not look up that location');
  }
  const geoData = await geoResponse.json();
  if (!geoData.results || !geoData.results.length) {
    throw new Error('No matching location found');
  }

  const place = geoData.results[0];
  const { latitude, longitude } = place;

  const weatherResponse = await fetch(
    `${WEATHER_BASE_URL}?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`,
  );

  if (!weatherResponse.ok) {
    throw new Error('Failed to fetch weather');
  }

  const weatherData = await weatherResponse.json();
  const current = weatherData.current;
  if (!current) {
    throw new Error('No current weather data available');
  }

  const weatherType = mapWeatherCodeToType(current.weather_code);
  const icon = iconForType(weatherType);

  return {
    icon,
    temperature: `${Math.round(current.temperature_2m)}°C`,
    weatherType,
    humidity: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : undefined,
    windSpeed: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : undefined,
    locationName: place.name && place.country ? `${place.name}, ${place.country}` : place.name || trimmed,
  };
}
