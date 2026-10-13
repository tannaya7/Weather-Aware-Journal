import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mapWeatherCodeToType,
  iconForType,
  fetchWeatherForCity,
  fetchWeatherAt,
  fetchWeatherForCoords,
  getCurrentPosition,
  isPastDate,
} from '../../src/lib/weatherApi.js';

describe('mapWeatherCodeToType', () => {
  it.each([
    [0, 'Clear sky'],
    [2, 'Clouds'],
    [45, 'Fog'],
    [55, 'Drizzle'],
    [65, 'Rain'],
    [73, 'Snow'],
    [95, 'Thunderstorm'],
    [20, 'Unknown'],
  ])('maps code %i to %s', (code, expected) => {
    expect(mapWeatherCodeToType(code)).toBe(expected);
  });
});

describe('iconForType', () => {
  it.each([
    ['Clear sky', '☀️'],
    ['Clouds', '⛅'],
    ['Rain', '🌧️'],
    ['Snow', '❄️'],
    ['Thunderstorm', '⛈️'],
    ['Fog', '🌫️'],
    ['', '⛅'],
  ])('maps %s to %s', (type, expected) => {
    expect(iconForType(type)).toBe(expected);
  });
});

describe('fetchWeatherForCity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a blank city name without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchWeatherForCity('   ')).rejects.toThrow('City name is required');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws when no geocoding match is found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }),
    );
    await expect(fetchWeatherForCity('Nowhereville')).rejects.toThrow('No matching location found');
  });

  it('returns mapped weather data on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ latitude: 51.5, longitude: -0.1, name: 'London', country: 'United Kingdom' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 18.4, relative_humidity_2m: 60, weather_code: 1, wind_speed_10m: 4 },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWeatherForCity('London');
    expect(result).toEqual({
      icon: '⛅',
      temperature: '18°C',
      weatherType: 'Clouds',
      humidity: 60,
      windSpeed: 4,
      locationName: 'London, United Kingdom',
      latitude: 51.5,
      longitude: -0.1,
    });
    expect(fetchMock.mock.calls[1][0]).toContain('current=');
    expect(fetchMock.mock.calls[1][0]).toContain('wind_speed_unit=ms');
  });
});

function jsonResponse(body) {
  return { ok: true, json: async () => body };
}

function hourly(day, temps) {
  return {
    hourly: {
      time: temps.map((_, h) => `${day}T${String(h).padStart(2, '0')}:00`),
      temperature_2m: temps,
      relative_humidity_2m: temps.map(() => 70),
      weather_code: temps.map(() => 61),
      wind_speed_10m: temps.map(() => 3),
    },
  };
}

describe('fetchWeatherAt', () => {
  const NOW = new Date(2026, 9, 5, 20, 0);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses current weather for an entry about right now', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ current: { temperature_2m: 25, weather_code: 0, relative_humidity_2m: 40, wind_speed_10m: 2 } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWeatherAt({ latitude: 1, longitude: 2, date: new Date(2026, 9, 5, 19, 30), now: NOW });

    expect(result.weatherType).toBe('Clear sky');
    expect(fetchMock.mock.calls[0][0]).toContain('current=');
  });

  it("looks up a recent past day's weather at the entry's hour", async () => {
    const temps = Array.from({ length: 24 }, (_, h) => 10 + h);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(hourly('2026-09-20', temps)));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWeatherAt({
      latitude: 1,
      longitude: 2,
      date: new Date(2026, 8, 20, 14, 45),
      now: NOW,
    });

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('https://api.open-meteo.com/v1/forecast');
    expect(url).toContain('start_date=2026-09-20&end_date=2026-09-20');
    expect(result).toMatchObject({ temperature: '24°C', weatherType: 'Rain', humidity: 70, windSpeed: 3 });
  });

  it('uses the historical archive for older dates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(hourly('2024-01-15', Array(24).fill(-3))));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWeatherAt({ latitude: 1, longitude: 2, date: new Date(2024, 0, 15, 9), now: NOW });

    expect(fetchMock.mock.calls[0][0]).toContain('https://archive-api.open-meteo.com/v1/archive');
    expect(result.temperature).toBe('-3°C');
  });

  it("fails clearly when there's no data for that hour", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ hourly: { time: [] } })));
    await expect(
      fetchWeatherAt({ latitude: 1, longitude: 2, date: new Date(2024, 0, 15, 9), now: NOW }),
    ).rejects.toThrow('No weather data for that date');
  });
});

describe('isPastDate', () => {
  const NOW = new Date(2026, 9, 5, 20, 0);
  it('treats the last two hours as now', () => {
    expect(isPastDate(new Date(2026, 9, 5, 18, 30), NOW)).toBe(false);
    expect(isPastDate(new Date(2026, 9, 5, 17, 0), NOW)).toBe(true);
    expect(isPastDate(undefined, NOW)).toBe(false);
    expect(isPastDate('not a date', NOW)).toBe(false);
  });
});

describe('fetchWeatherForCoords', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the place from the coordinates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('bigdatacloud')
          ? jsonResponse({ city: 'Hyderabad', countryName: 'India' })
          : jsonResponse({ current: { temperature_2m: 30, weather_code: 3 } }),
      ),
    );

    const result = await fetchWeatherForCoords(17.38, 78.47);

    expect(result).toMatchObject({ locationName: 'Hyderabad, India', latitude: 17.38, longitude: 78.47, weatherType: 'Clouds' });
  });

  it('still returns the weather if naming the place fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('bigdatacloud')
          ? { ok: false, json: async () => ({}) }
          : jsonResponse({ current: { temperature_2m: 30, weather_code: 3 } }),
      ),
    );

    expect((await fetchWeatherForCoords(1, 2)).locationName).toBe('Current location');
  });
});

describe('getCurrentPosition', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubGeolocation(impl) {
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition: impl } });
  }

  it('resolves with coordinates', async () => {
    stubGeolocation((ok) => ok({ coords: { latitude: 5, longitude: 6 } }));
    await expect(getCurrentPosition()).resolves.toEqual({ latitude: 5, longitude: 6 });
  });

  it('explains a blocked permission', async () => {
    stubGeolocation((_ok, fail) => fail({ code: 1 }));
    await expect(getCurrentPosition()).rejects.toThrow(/blocked/);
  });
});
