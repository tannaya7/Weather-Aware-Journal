import { describe, expect, it } from 'vitest';
import {
  describeMood,
  moodByTemperature,
  onThisDay,
  parseTemperature,
  weeklyMoodTrend,
} from '../../src/lib/insights.js';

const NOW = new Date(2026, 9, 5, 12); // Monday, 5 Oct 2026

function at(y, m, d, mood, extra = {}) {
  return { id: `${y}-${m}-${d}-${mood}`, date: new Date(y, m, d, 12).toISOString(), mood, ...extra };
}

describe('weeklyMoodTrend', () => {
  it('returns one bucket per week, oldest first, starting on Mondays', () => {
    const trend = weeklyMoodTrend([], { weeks: 4, now: NOW });
    expect(trend).toHaveLength(4);
    expect(trend.map((w) => w.weekStart.getDay())).toEqual([1, 1, 1, 1]);
    expect(trend[3].weekStart).toEqual(new Date(2026, 9, 5));
    expect(trend[0].weekStart).toEqual(new Date(2026, 8, 14));
  });

  it('averages mood scores within a week', () => {
    const trend = weeklyMoodTrend(
      [at(2026, 9, 5, 'Happy'), at(2026, 9, 6, 'Sad'), at(2026, 9, 7, 'Peaceful')],
      { weeks: 2, now: NOW },
    );
    expect(trend[1]).toMatchObject({ count: 3, average: (2 - 2 + 1) / 3 });
  });

  it('leaves weeks without entries empty instead of zero', () => {
    const trend = weeklyMoodTrend([at(2026, 9, 5, 'Happy')], { weeks: 3, now: NOW });
    expect(trend[0]).toMatchObject({ count: 0, average: null });
  });

  it('ignores entries outside the range, without a mood, or with a bad date', () => {
    const trend = weeklyMoodTrend(
      [at(2025, 0, 1, 'Happy'), at(2026, 9, 5, undefined), { mood: 'Sad', date: 'nope' }],
      { weeks: 4, now: NOW },
    );
    expect(trend.every((w) => w.count === 0)).toBe(true);
  });

  it('keeps weeks aligned across a daylight-saving change', () => {
    // Weeks spanning late March, when many time zones shift by an hour.
    const now = new Date(2026, 3, 6, 12);
    const trend = weeklyMoodTrend([at(2026, 2, 30, 'Happy')], { weeks: 3, now });
    expect(trend[1]).toMatchObject({ count: 1 });
  });
});

describe('describeMood', () => {
  it.each([
    [2, 'Great'],
    [1, 'Good'],
    [0, 'Mixed'],
    [-1, 'Low'],
    [-2, 'Very low'],
    [null, 'No entries'],
  ])('describes %s as %s', (avg, label) => {
    expect(describeMood(avg)).toBe(label);
  });
});

describe('parseTemperature', () => {
  it('reads display strings and numbers', () => {
    expect(parseTemperature('18°C')).toBe(18);
    expect(parseTemperature('-3°C')).toBe(-3);
    expect(parseTemperature(12.5)).toBe(12.5);
    expect(parseTemperature(undefined)).toBeNull();
    expect(parseTemperature('n/a')).toBeNull();
  });
});

describe('moodByTemperature', () => {
  it('averages temperature per mood, in mood order, skipping entries without weather', () => {
    const result = moodByTemperature([
      { mood: 'Sad', temperature: '10°C' },
      { mood: 'Happy', temperature: '24°C' },
      { mood: 'Happy', temperature: '28°C' },
      { mood: 'Happy' },
      { temperature: '30°C' },
    ]);
    expect(result).toEqual([
      { mood: 'Happy', emoji: '😊', averageTemp: 26, count: 2 },
      { mood: 'Sad', emoji: '😢', averageTemp: 10, count: 1 },
    ]);
  });
});

describe('onThisDay', () => {
  it('finds entries from this date in earlier years, newest first', () => {
    const result = onThisDay(
      [
        at(2024, 9, 5, 'Happy'),
        at(2025, 9, 5, 'Sad'),
        at(2026, 9, 5, 'Excited'), // today, not a memory
        at(2025, 9, 6, 'Peaceful'), // different day
      ],
      NOW,
    );
    expect(result.map((r) => [r.entry.mood, r.yearsAgo])).toEqual([
      ['Sad', 1],
      ['Happy', 2],
    ]);
  });
});
