import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchForecast, forecastHeadsUp, latestPlace, recentTemperature } from '../../src/lib/forecast.js';

const NOW = new Date(2026, 9, 12, 12);

function day(overrides = {}) {
  return { date: '2026-10-13', code: 1, weatherType: 'Clouds', icon: '⛅', max: 15, min: 8, precipitation: 0, uv: 3, ...overrides };
}

function daysAgo(n) {
  return new Date(2026, 9, 12 - n, 12).toISOString();
}

function entriesAt(temp, count = 5, extra = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    date: daysAgo(i + 1),
    temperature: `${temp}°C`,
    ...extra,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchForecast', () => {
  it('reads the daily forecast into tidy days', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: {
          time: ['2026-10-12', '2026-10-13'],
          weather_code: [0, 63],
          temperature_2m_max: [20.4, 14.6],
          temperature_2m_min: [10.2, 9.1],
          precipitation_sum: [0, 12.3],
          uv_index_max: [4, 1],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const days = await fetchForecast({ latitude: 51.5, longitude: -0.12 });
    expect(fetchMock.mock.calls[0][0]).toContain('latitude=51.5&longitude=-0.12');
    expect(days).toHaveLength(2);
    expect(days[1]).toMatchObject({ weatherType: 'Rain', max: 15, min: 9, precipitation: 12.3 });
    expect(days[0].icon).toBe('☀️');
  });

  it('fails clearly when the request or the data is bad', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchForecast({ latitude: 1, longitude: 2 })).rejects.toThrow('Could not load');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(fetchForecast({ latitude: 1, longitude: 2 })).rejects.toThrow('No forecast');
  });
});

describe('latestPlace and recentTemperature', () => {
  it('uses the newest entry that has coordinates', () => {
    const entries = [
      { date: daysAgo(10), latitude: 1, longitude: 2, locationName: 'Old' },
      { date: daysAgo(1), latitude: 3, longitude: 4, locationName: 'New' },
      { date: daysAgo(0), locationName: 'No coords' },
      { date: 'bad', latitude: 5, longitude: 6 },
    ];
    expect(latestPlace(entries)).toEqual({ latitude: 3, longitude: 4, locationName: 'New' });
    expect(latestPlace([{ date: daysAgo(1) }])).toBeNull();
  });

  it('averages only the last two weeks, and needs at least three readings', () => {
    expect(recentTemperature(entriesAt(10, 4), NOW)).toBe(10);
    expect(recentTemperature(entriesAt(10, 2), NOW)).toBeNull();
    const old = [{ date: daysAgo(30), temperature: '40°C' }, ...entriesAt(10, 3)];
    expect(recentTemperature(old, NOW)).toBe(10);
  });
});

describe('forecastHeadsUp', () => {
  const today = day({ date: '2026-10-12', max: 15 });

  it('returns null without a tomorrow', () => {
    expect(forecastHeadsUp([today], [], NOW)).toBeNull();
  });

  it('flags a storm first', () => {
    const r = forecastHeadsUp([today, day({ code: 95, weatherType: 'Thunderstorm', max: 35 })], [], NOW);
    expect(r.kind).toBe('storm');
  });

  it('flags the first snow only when there has been none for months', () => {
    const snow = day({ code: 73, weatherType: 'Snow', max: -1, min: -4 });
    expect(forecastHeadsUp([today, snow], [], NOW).kind).toBe('first-snow');
    const recent = [{ date: daysAgo(30), weatherType: 'Snow' }];
    expect(forecastHeadsUp([today, snow], recent, NOW).kind).not.toBe('first-snow');
  });

  it('flags heat by absolute temperature or by a jump from recent days', () => {
    expect(forecastHeadsUp([today, day({ max: 33 })], [], NOW).kind).toBe('heat');
    expect(forecastHeadsUp([today, day({ max: 24 })], entriesAt(12), NOW).kind).toBe('heat');
    expect(forecastHeadsUp([today, day({ max: 24 })], entriesAt(20), NOW).kind).not.toBe('heat');
  });

  it('flags cold by absolute temperature or by a drop from recent days', () => {
    expect(forecastHeadsUp([today, day({ max: 2, min: -6 })], [], NOW).kind).toBe('cold');
    expect(forecastHeadsUp([today, day({ max: 5, min: 1 })], entriesAt(18), NOW).kind).toBe('cold');
  });

  it('flags heavy rain, sun after rain, and big swings', () => {
    expect(forecastHeadsUp([today, day({ code: 65, weatherType: 'Rain', precipitation: 14 })], [], NOW).kind).toBe('heavy-rain');
    const rainToday = day({ date: '2026-10-12', code: 61, weatherType: 'Rain', max: 15 });
    expect(forecastHeadsUp([rainToday, day({ code: 0, weatherType: 'Clear sky', max: 16 })], [], NOW).kind).toBe('sun-returns');
    expect(forecastHeadsUp([today, day({ max: 24 })], [], NOW).kind).toBe('swing');
  });

  it('falls back to a plain summary with a prompt', () => {
    const r = forecastHeadsUp([today, day()], [], NOW);
    expect(r).toMatchObject({ kind: 'ordinary', headline: 'Tomorrow: clouds, 8° to 15°C.' });
    expect(r.prompt).toMatch(/good day/);
  });
});
