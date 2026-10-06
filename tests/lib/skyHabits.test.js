import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeAirQuality, describeUv, fetchSkyAt, moonPhase, pickSky } from '../../src/lib/sky.js';
import {
  DEFAULT_HABITS,
  cleanHabitValues,
  enabledHabits,
  habitMoodEffects,
  makeCustomHabit,
} from '../../src/lib/habits.js';
import { moodByFactor, withMoonFraction } from '../../src/lib/insights.js';

function json(body) {
  return { ok: true, json: async () => body };
}

describe('moonPhase', () => {
  it.each([
    ['2024-01-11T12:00:00Z', 'New moon'],
    ['2024-01-25T18:00:00Z', 'Full moon'],
    ['2024-01-18T03:00:00Z', 'First quarter'],
    ['2024-02-02T23:00:00Z', 'Last quarter'],
  ])('%s is a %s', (date, name) => {
    expect(moonPhase(date).name).toBe(name);
  });

  it('gives a fraction through the cycle', () => {
    const { fraction } = moonPhase('2024-01-25T18:00:00Z');
    expect(fraction).toBeGreaterThan(0.45);
    expect(fraction).toBeLessThan(0.55);
  });
});

describe('labels', () => {
  it.each([
    [20, 'Good'],
    [75, 'Moderate'],
    [120, 'Unhealthy for sensitive groups'],
    [180, 'Unhealthy'],
    [250, 'Very unhealthy'],
    [400, 'Hazardous'],
  ])('AQI %i is %s', (aqi, label) => {
    expect(describeAirQuality(aqi)).toBe(label);
  });

  it.each([
    [1, 'Low'],
    [4, 'Moderate'],
    [7, 'High'],
    [9, 'Very high'],
    [12, 'Extreme'],
  ])('UV %i is %s', (uv, label) => {
    expect(describeUv(uv)).toBe(label);
  });

  it('has no label without a value', () => {
    expect(describeAirQuality(undefined)).toBeNull();
    expect(describeUv(null)).toBeNull();
  });
});

describe('fetchSkyAt', () => {
  const NOW = new Date(2026, 9, 6, 20);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads sun, daylight, UV, and the air quality at the entry hour', async () => {
    const fetchMock = vi.fn(async (url) =>
      url.includes('air-quality')
        ? json({ hourly: { time: ['2026-09-20T13:00', '2026-09-20T14:00'], us_aqi: [40, 55] } })
        : json({
            daily: {
              sunrise: ['2026-09-20T06:04'],
              sunset: ['2026-09-20T18:14'],
              daylight_duration: [43780],
              uv_index_max: [8.65],
            },
          }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sky = await fetchSkyAt({ latitude: 1, longitude: 2, date: new Date(2026, 8, 20, 14, 30), now: NOW });

    expect(sky).toEqual({ sunrise: '06:04', sunset: '18:14', daylightHours: 12.2, uvIndex: 8.65, airQuality: 55 });
    expect(fetchMock.mock.calls.some(([u]) => u.includes('api.open-meteo.com/v1/forecast') && u.includes('uv_index_max'))).toBe(true);
  });

  it('uses the archive (no UV there) for older dates', async () => {
    const fetchMock = vi.fn(async (url) =>
      url.includes('air-quality')
        ? json({ hourly: { time: [], us_aqi: [] } })
        : json({ daily: { sunrise: ['2024-03-10T06:30'], sunset: ['2024-03-10T18:20'], daylight_duration: [42600] } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sky = await fetchSkyAt({ latitude: 1, longitude: 2, date: new Date(2024, 2, 10, 9), now: NOW });

    const sunUrl = fetchMock.mock.calls.find(([u]) => !u.includes('air-quality'))[0];
    expect(sunUrl).toContain('archive-api.open-meteo.com');
    expect(sunUrl).not.toContain('uv_index_max');
    expect(sky).toEqual({ sunrise: '06:30', sunset: '18:20', daylightHours: 11.8 });
  });

  it('returns whatever it could get when a lookup fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('air-quality')
          ? { ok: false, json: async () => ({}) }
          : json({ daily: { sunrise: ['2026-10-06T06:00'], sunset: ['2026-10-06T18:00'] } }),
      ),
    );
    expect(await fetchSkyAt({ latitude: 1, longitude: 2, now: NOW })).toEqual({ sunrise: '06:00', sunset: '18:00' });
  });

  it('pickSky keeps only sky fields', () => {
    expect(pickSky({ sunrise: '06:00', temperature: '20°C', airQuality: 30 })).toEqual({
      sunrise: '06:00',
      sunset: undefined,
      daylightHours: undefined,
      uvIndex: undefined,
      airQuality: 30,
    });
  });
});

describe('habits', () => {
  const exercise = DEFAULT_HABITS.find((h) => h.id === 'exercise');
  const sleep = DEFAULT_HABITS.find((h) => h.id === 'sleep');

  function day(mood, habits) {
    return { id: Math.random(), mood, habits };
  }

  it('compares days with and without a yes/no habit', () => {
    const entries = [
      day('Happy', { exercise: true }),
      day('Excited', { exercise: true }),
      day('Happy', { exercise: true }),
      day('Sad', { exercise: false }),
      day('Anxious', { exercise: false }),
      day('Peaceful', { exercise: false }),
    ];
    const [effect] = habitMoodEffects(entries, [exercise]);

    expect(effect.high).toEqual({ label: 'Days with', average: 2, days: 3 });
    expect(effect.low.label).toBe('Days without');
    expect(effect.low.average).toBeCloseTo((-2 - 1 + 1) / 3);
    expect(effect.difference).toBeGreaterThan(2);
  });

  it('splits number habits at your median', () => {
    const entries = [4, 5, 6, 7, 8, 9].map((hours, i) => day(i < 3 ? 'Sad' : 'Happy', { sleep: hours }));
    const [effect] = habitMoodEffects(entries, [sleep]);

    expect(effect.high.label).toBe('More than 6.5 hours');
    expect(effect.low.label).toBe('6.5 hours or less');
    expect(effect.high.average).toBe(2);
    expect(effect.low.average).toBe(-2);
  });

  it('skips habits without at least 3 days on each side', () => {
    const entries = [day('Happy', { exercise: true }), day('Sad', { exercise: false })];
    expect(habitMoodEffects(entries, [exercise])).toEqual([]);
  });

  it('cleans form values into typed, non-empty habit data', () => {
    expect(cleanHabitValues({ sleep: '7.5', exercise: true, water: '', other: 3 }, DEFAULT_HABITS)).toEqual({
      sleep: 7.5,
      exercise: true,
    });
    expect(cleanHabitValues({ sleep: '' }, DEFAULT_HABITS)).toBeUndefined();
  });

  it('lists enabled habits including custom ones', () => {
    const custom = makeCustomHabit('  Meditated ', '🧘');
    expect(custom).toMatchObject({ name: 'Meditated', emoji: '🧘', type: 'boolean' });
    const config = { enabled: ['sleep', custom.id], custom: [custom] };
    expect(enabledHabits(config).map((h) => h.name)).toEqual(['Sleep', 'Meditated']);
  });
});

describe('moodByFactor', () => {
  it('groups by daylight hours', () => {
    const rows = moodByFactor(
      [
        { mood: 'Sad', daylightHours: 9.5 },
        { mood: 'Happy', daylightHours: 13 },
        { mood: 'Excited', daylightHours: 13.5 },
        { mood: 'Happy' },
      ],
      'daylight',
    );
    expect(rows).toEqual([
      { label: 'Under 10 hours', average: -2, count: 1 },
      { label: '12–14 hours', average: 2, count: 2 },
    ]);
  });

  it('groups by moon phase using the entry date', () => {
    const rows = moodByFactor(
      [
        { mood: 'Happy', date: '2024-01-25T18:00:00Z' },
        { mood: 'Sad', date: '2024-01-11T12:00:00Z' },
      ],
      'moon',
      withMoonFraction,
    );
    expect(rows.map((r) => r.label)).toEqual(['🌑 New moon', '🌕 Full moon']);
  });
});
