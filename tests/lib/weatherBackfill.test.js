import { describe, expect, it, vi } from 'vitest';
import { backfillWeather, entriesMissingWeather } from '../../src/lib/weatherBackfill.js';

const WEATHER = {
  icon: '🌧️',
  temperature: '12°C',
  weatherType: 'Rain',
  humidity: 80,
  windSpeed: 4,
};

describe('entriesMissingWeather', () => {
  it('picks dated entries without weather', () => {
    const result = entriesMissingWeather([
      { id: 1, date: '2026-01-01' },
      { id: 2, date: '2026-01-02', weatherType: 'Rain' },
      { id: 3 },
      { id: 4, date: 'nope' },
    ]);
    expect(result.map((e) => e.id)).toEqual([1]);
  });
});

describe('backfillWeather', () => {
  it('uses each entry’s place, looking each place up only once', async () => {
    const geocode = vi.fn(async (name) => ({ latitude: 1, longitude: 2, locationName: `${name}!` }));
    const fetchAt = vi.fn(async () => WEATHER);
    const onResult = vi.fn();

    const summary = await backfillWeather(
      [
        { id: 1, date: '2026-01-01', locationName: 'Oslo' },
        { id: 2, date: '2026-01-02', locationName: 'oslo' },
        { id: 3, date: '2026-01-03', latitude: 5, longitude: 6, locationName: 'Here' },
      ],
      { geocode, fetchAt, onResult },
    );

    expect(summary).toEqual({ updated: 3, skipped: 0, failed: 0 });
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(fetchAt).toHaveBeenCalledWith({ latitude: 5, longitude: 6, date: '2026-01-03' });
    expect(onResult).toHaveBeenCalledWith(1, {
      weatherIcon: '🌧️',
      temperature: '12°C',
      weatherType: 'Rain',
      humidity: 80,
      windSpeed: 4,
      locationName: 'Oslo',
      latitude: 1,
      longitude: 2,
    });
  });

  it('uses the fallback city for entries without a place, or skips them', async () => {
    const geocode = vi.fn(async () => ({ latitude: 1, longitude: 2, locationName: 'Pune, India' }));
    const fetchAt = vi.fn(async () => WEATHER);
    const onResult = vi.fn();

    const withCity = await backfillWeather([{ id: 1, date: '2026-01-01' }], {
      fallbackCity: 'Pune',
      geocode,
      fetchAt,
      onResult,
    });
    expect(withCity.updated).toBe(1);
    expect(onResult.mock.calls[0][1].locationName).toBe('Pune, India');

    const without = await backfillWeather([{ id: 2, date: '2026-01-01' }], { geocode, fetchAt, onResult });
    expect(without).toEqual({ updated: 0, skipped: 1, failed: 0 });
  });

  it('keeps going after a failed lookup and reports progress', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchAt = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(WEATHER);
    const onProgress = vi.fn();

    const summary = await backfillWeather(
      [
        { id: 1, date: '2026-01-01', latitude: 1, longitude: 2 },
        { id: 2, date: '2026-01-02', latitude: 1, longitude: 2 },
      ],
      { fetchAt, onProgress },
    );

    expect(summary).toEqual({ updated: 1, skipped: 0, failed: 1 });
    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    const fetchAt = vi.fn(async () => {
      controller.abort();
      return WEATHER;
    });

    const summary = await backfillWeather(
      [
        { id: 1, date: '2026-01-01', latitude: 1, longitude: 2 },
        { id: 2, date: '2026-01-02', latitude: 1, longitude: 2 },
      ],
      { fetchAt, signal: controller.signal },
    );

    expect(fetchAt).toHaveBeenCalledTimes(1);
    expect(summary.updated).toBe(1);
  });
});
