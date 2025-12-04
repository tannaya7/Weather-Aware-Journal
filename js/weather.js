// Weather utilities: fetch live weather data for a city and update the new-entry page UI

import { announce } from './a11y.js';

let lastWeather = null;

const GEO_BASE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

function mapWeatherCodeToType(code) {
    if (code === 0) return 'Clear sky';
    if (code === 1 || code === 2 || code === 3) return 'Clouds';
    if (code === 45 || code === 48) return 'Fog';
    if (code >= 51 && code <= 57) return 'Drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain';
    if (code >= 71 && code <= 77) return 'Snow';
    if (code >= 95) return 'Thunderstorm';
    return 'Unknown';
}

function iconForType(type) {
    const value = (type || '').toLowerCase();
    if (value.includes('clear')) return '☀️';
    if (value.includes('cloud')) return '⛅';
    if (value.includes('rain') || value.includes('drizzle')) return '🌧️';
    if (value.includes('snow')) return '❄️';
    if (value.includes('thunder')) return '⛈️';
    if (value.includes('fog')) return '🌫️';
    return '⛅';
}

async function fetchWeatherForCity(cityName) {
    const trimmed = cityName.trim();
    if (!trimmed) {
        throw new Error('City name is required');
    }

    // First, convert city name to coordinates
    const geoResponse = await fetch(`${GEO_BASE_URL}?name=${encodeURIComponent(trimmed)}&count=1`);
    if (!geoResponse.ok) {
        throw new Error('Could not look up that location');
    }
    const geoData = await geoResponse.json();
    if (!geoData.results || !geoData.results.length) {
        throw new Error('No matching location found');
    }

    const place = geoData.results[0];
    const latitude = place.latitude;
    const longitude = place.longitude;

    const weatherResponse = await fetch(
        `${WEATHER_BASE_URL}?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
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

    lastWeather = {
        icon,
        temperature: `${Math.round(current.temperature_2m)}°C`,
        weatherType,
        humidity: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : undefined,
        windSpeed: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : undefined,
        locationName: place.name && place.country ? `${place.name}, ${place.country}` : (place.name || trimmed)
    };

    return lastWeather;
}

function renderWeatherInBox(weather, dom) {
    if (!weather || !dom) return;

    const { iconEl, tempEl, typeEl, detailsEl } = dom;

    if (iconEl) {
        iconEl.textContent = weather.icon;
        iconEl.setAttribute('aria-hidden', 'true');
    }
    if (tempEl) {
        tempEl.textContent = weather.temperature;
        tempEl.setAttribute('aria-label', `Temperature ${weather.temperature}`);
    }
    if (typeEl) typeEl.textContent = weather.weatherType;

    if (detailsEl) {
        detailsEl.innerHTML = '';

        if (weather.locationName) {
            const span = document.createElement('span');
            span.textContent = weather.locationName;
            detailsEl.appendChild(span);
        }
        if (typeof weather.humidity === 'number') {
            const span = document.createElement('span');
            span.innerHTML = `<span aria-hidden="true">💧</span> ${weather.humidity}%`;
            span.setAttribute('aria-label', `Humidity ${weather.humidity} percent`);
            detailsEl.appendChild(span);
        }
        if (typeof weather.windSpeed === 'number') {
            const span = document.createElement('span');
            span.innerHTML = `<span aria-hidden="true">💨</span> ${weather.windSpeed} m/s`;
            span.setAttribute('aria-label', `Wind speed ${weather.windSpeed} meters per second`);
            detailsEl.appendChild(span);
        }
    }
}

export function getLastFetchedWeather() {
    return lastWeather;
}

// Hook up the weather section on the new-entry page
export function initWeatherBox() {
    const locationInput = document.getElementById('locationInput');
    const fetchBtn = document.getElementById('fetchWeatherBtn');
    const statusEl = document.getElementById('weatherStatus');
    const iconEl = document.getElementById('weatherIcon');
    const tempEl = document.getElementById('weatherTemp');
    const typeEl = document.getElementById('weatherType');
    const detailsEl = document.getElementById('weatherDetails');

    if (!locationInput || !fetchBtn || !iconEl || !tempEl || !typeEl || !detailsEl) {
        // Not on the new-entry page; nothing to do
        return;
    }

    const domRefs = { iconEl, tempEl, typeEl, detailsEl };

    async function handleFetch() {
        const city = locationInput.value.trim();
        if (!city) {
            if (statusEl) statusEl.textContent = 'Enter a city name to fetch the weather.';
            return;
        }

        if (statusEl) statusEl.textContent = 'Fetching weather…';
        announce('Fetching weather data...', 'polite');

        try {
            const weather = await fetchWeatherForCity(city);
            renderWeatherInBox(weather, domRefs);
            if (statusEl) statusEl.textContent = `Weather updated for ${weather.locationName}.`;
            announce(`Weather updated. ${weather.weatherType}, ${weather.temperature}`, 'polite');
        } catch (error) {
            console.error(error);
            if (statusEl) statusEl.textContent = 'Could not fetch weather. Please try again.';
            announce('Weather fetch failed. Please try again.', 'assertive');
        }
    }

    fetchBtn.addEventListener('click', () => {
        handleFetch();
    });

    locationInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleFetch();
        }
    });
}
