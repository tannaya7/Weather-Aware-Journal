import { describe, expect, it, vi } from 'vitest';
import {
  availablePeriods,
  compareWithPrevious,
  drawPeriodReview,
  entriesInPeriod,
  periodOf,
  periodSummary,
} from '../../src/lib/periodReview.js';

function on(y, m, d, extra = {}, hour = 12) {
  return { id: `${y}-${m}-${d}-${hour}`, date: new Date(y, m, d, hour).toISOString(), content: 'a few words here', ...extra };
}

// Week of Mon 12 Oct - Sun 18 Oct 2026.
const WEEK = periodOf('week', new Date(2026, 9, 14));

describe('periodOf', () => {
  it('runs a week Monday to Sunday', () => {
    expect(WEEK.start).toEqual(new Date(2026, 9, 12));
    expect(WEEK.end).toEqual(new Date(2026, 9, 19));
    expect(WEEK.label).toBe('12 Oct – 18 Oct 2026');
    expect(periodOf('week', new Date(2026, 9, 18, 23, 59)).key).toBe(WEEK.key);
    expect(periodOf('week', new Date(2026, 9, 19, 0, 1)).key).not.toBe(WEEK.key);
  });

  it('spans a week across a month or year boundary', () => {
    const p = periodOf('week', new Date(2026, 11, 31));
    expect(p.label).toBe('28 Dec – 3 Jan 2027');
  });

  it('runs a month from the 1st', () => {
    const p = periodOf('month', new Date(2026, 1, 20));
    expect(p.start).toEqual(new Date(2026, 1, 1));
    expect(p.end).toEqual(new Date(2026, 2, 1));
    expect(p.label).toBe('February 2026');
    expect(p.key).toBe('m-2026-02');
  });
});

describe('availablePeriods / entriesInPeriod', () => {
  const entries = [on(2026, 9, 14), on(2026, 9, 15), on(2026, 9, 5), on(2026, 8, 30), { id: 'x', date: 'nope' }];

  it('lists periods that have entries, newest first, once each', () => {
    const weeks = availablePeriods(entries, 'week');
    expect(weeks.map((w) => w.label)).toEqual(['12 Oct – 18 Oct 2026', '5 Oct – 11 Oct 2026', '28 Sep – 4 Oct 2026']);
    expect(availablePeriods(entries, 'month').map((m) => m.label)).toEqual(['October 2026', 'September 2026']);
    expect(availablePeriods([], 'week')).toEqual([]);
  });

  it('includes the start of the period and excludes the end', () => {
    const edges = [on(2026, 9, 12, {}, 0), on(2026, 9, 19, {}, 0), on(2026, 9, 18, {}, 23)];
    expect(entriesInPeriod(edges, WEEK)).toHaveLength(2);
  });
});

describe('periodSummary', () => {
  const entries = [
    on(2026, 9, 12, { mood: 'Happy', weatherType: 'Clear sky', temperature: '20°C' }),
    on(2026, 9, 13, { mood: 'Sad', weatherType: 'Rain', temperature: '9°C' }),
    on(2026, 9, 13, { mood: 'Sad', weatherType: 'Rain', temperature: '10°C' }, 20),
    on(2026, 9, 15, { mood: 'Peaceful', weatherType: 'Rain' }),
    on(2026, 9, 5, { mood: 'Peaceful' }), // previous week
    on(2026, 9, 6, { mood: 'Happy' }),
  ];

  it('counts entries, days, words, and moods', () => {
    const s = periodSummary(entries, WEEK);
    expect(s.entries).toBe(4);
    expect(s.daysWritten).toBe(3);
    expect(s.words).toBe(16);
    expect(s.moodCounts.find((m) => m.mood === 'Sad').count).toBe(2);
    expect(s.moodCounts.find((m) => m.mood === 'Excited').count).toBe(0);
  });

  it('averages mood and finds the best and hardest days', () => {
    const s = periodSummary(entries, WEEK);
    // Daily averages: Mon 2, Tue -2, Thu 1 -> mean 1/3 -> Mixed.
    expect(s.averageMood.label).toBe('Mixed');
    expect(s.bestDay).toMatchObject({ label: 'Great' });
    expect(s.bestDay.date).toEqual(new Date(2026, 9, 12));
    expect(s.hardestDay.date).toEqual(new Date(2026, 9, 13));
    expect(s.hardestDay.label).toBe('Very low');
  });

  it('finds the top weather and temperature range', () => {
    const s = periodSummary(entries, WEEK);
    expect(s.topWeather).toMatchObject({ type: 'Rain', count: 3 });
    expect(s.temperatureRange).toEqual({ min: 9, max: 20 });
  });

  it('compares with the week before', () => {
    const s = periodSummary(entries, WEEK);
    expect(s.previousMood.label).toBe('Great'); // (1 + 2) / 2 = 1.5
    expect(compareWithPrevious(s)).toMatch(/^Down from/);
    expect(compareWithPrevious(periodSummary(entries.slice(0, 4), WEEK))).toBeNull();
  });

  it('leaves out highlights it has no data for', () => {
    const s = periodSummary([on(2026, 9, 14)], WEEK);
    expect(s).toMatchObject({ entries: 1, averageMood: null, bestDay: null, hardestDay: null, topWeather: null, temperatureRange: null });
  });

  it('has no best or hardest day when every day scored the same', () => {
    const same = [on(2026, 9, 12, { mood: 'Happy' }), on(2026, 9, 13, { mood: 'Happy' })];
    const s = periodSummary(same, WEEK);
    expect(s.bestDay).toBeNull();
    expect(s.hardestDay).toBeNull();
  });

  it('includes weekly goal results for week reviews only', () => {
    const habits = [{ id: 'exercise', name: 'Exercise', emoji: '🏃', type: 'boolean' }];
    const goals = { exercise: { days: 2 } };
    const logged = [
      on(2026, 9, 12, { habits: { exercise: true } }),
      on(2026, 9, 14, { habits: { exercise: true } }),
      on(2026, 9, 20, { habits: { exercise: true } }), // next week
    ];
    const week = periodSummary(logged, WEEK, { habits, goals });
    expect(week.goals).toEqual([{ habit: habits[0], goal: { days: 2 }, met: 2, target: 2, achieved: true }]);
    const month = periodSummary(logged, periodOf('month', new Date(2026, 9, 1)), { habits, goals });
    expect(month.goals).toEqual([]);
  });
});

describe('drawPeriodReview', () => {
  function recordingContext() {
    const texts = [];
    const ctx = {
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(),
      fillText: (value) => texts.push(value),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
    };
    return { ctx, texts };
  }

  it('draws a weekly review', () => {
    const { ctx, texts } = recordingContext();
    const entries = [
      on(2026, 9, 12, { mood: 'Happy', weatherType: 'Clear sky', temperature: '20°C' }),
      on(2026, 9, 13, { mood: 'Sad', weatherType: 'Rain', temperature: '9°C' }),
    ];
    drawPeriodReview(ctx, periodSummary(entries, WEEK));
    expect(texts).toEqual(
      expect.arrayContaining(['My week', '12 Oct – 18 Oct 2026', '2', 'entries', 'average mood', 'Best day', '12 Oct · Great', 'Hardest day', '9° to 20°C']),
    );
  });

  it('draws a monthly review with the month as the title', () => {
    const { ctx, texts } = recordingContext();
    drawPeriodReview(ctx, periodSummary([on(2026, 9, 14, { mood: 'Happy' })], periodOf('month', new Date(2026, 9, 1))));
    expect(texts).toEqual(expect.arrayContaining(['October', '2026', 'entry']));
  });

  it('shows at most five highlight lines', () => {
    const { ctx, texts } = recordingContext();
    const habits = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), emoji: '✅', type: 'boolean' }));
    const goals = Object.fromEntries(habits.map((h) => [h.id, { days: 1 }]));
    const entries = [
      on(2026, 9, 12, { mood: 'Happy', weatherType: 'Rain', temperature: '5°C', habits: { a: true } }),
      on(2026, 9, 13, { mood: 'Sad', weatherType: 'Rain', temperature: '9°C' }),
      on(2026, 9, 5, { mood: 'Peaceful' }),
    ];
    drawPeriodReview(ctx, periodSummary(entries, WEEK, { habits, goals }));
    const labels = ['Vs. last week', 'Best day', 'Hardest day', 'Most common weather', 'A goal', 'B goal', 'C goal', 'D goal', 'Temperature range'];
    expect(labels.filter((l) => texts.includes(l))).toHaveLength(5);
  });
});
