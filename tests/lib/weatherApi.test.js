import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapWeatherCodeToType, iconForType, fetchWeatherForCity } from '../../src/lib/weatherApi.js';

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
    });
  });
});
