import { describe, expect, it } from 'vitest';
import {
  backtestWeekdays,
  dailyMoods,
  moodOutlook,
  recentTrend,
  weekdayOf,
} from '../../src/lib/moodOutlook.js';
import { dayNumber } from '../../src/lib/goals.js';

// Sunday 11 Oct 2026, so "tomorrow" is Monday.
const TODAY = new Date(2026, 9, 11, 20);

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function entryOn(daysBefore, mood) {
  return { id: `d${daysBefore}`, date: new Date(2026, 9, 11 - daysBefore, 12).toISOString(), mood };
}

describe('weekdayOf / dailyMoods', () => {
  it('numbers weekdays from Monday', () => {
    expect(weekdayOf(dayNumber(new Date(2026, 9, 12)))).toBe(0); // Monday
    expect(weekdayOf(dayNumber(new Date(2026, 9, 18)))).toBe(6); // Sunday
    expect(weekdayOf(0)).toBe(3); // 1 Jan 1970 was a Thursday
  });

  it('averages a day, drops bad entries, and sorts oldest first', () => {
    const days = dailyMoods([
      entryOn(1, 'Happy'),
      entryOn(1, 'Sad'),
      entryOn(3, 'Peaceful'),
      { id: 'x', date: 'nope', mood: 'Happy' },
      entryOn(2, undefined),
    ]);
    expect(days.map((d) => d.score)).toEqual([1, 0]);
    expect(days[0].day).toBeLessThan(days[1].day);
  });
});

describe('moodOutlook', () => {
  it('asks for more days when there are fewer than 28', () => {
    const entries = Array.from({ length: 10 }, (_, i) => entryOn(i, 'Happy'));
    expect(moodOutlook(entries, TODAY)).toEqual({ enough: false, moodDays: 10, needed: 28 });
  });

  it('finds a real weekday rhythm and offers a tomorrow tendency', () => {
    // Mondays are always low, other days always good.
    const entries = Array.from({ length: 70 }, (_, i) => {
      const day = new Date(2026, 9, 11 - i, 12);
      return entryOn(i, day.getDay() === 1 ? 'Sad' : 'Happy');
    });
    const outlook = moodOutlook(entries, TODAY);
    expect(outlook.reliable).toBe(true);
    expect(outlook.improvement).toBeGreaterThan(0.5);
    expect(outlook.tomorrow).toMatchObject({ weekday: 'Monday', label: 'Low' });
    expect(outlook.tomorrow.basedOn).toBe(10);
    expect(outlook.weekdays[0]).toMatchObject({ weekday: 'Monday', days: 10, average: -2 });
  });

  it('refuses to predict from noise', () => {
    const rand = rng(11);
    const moods = ['Sad', 'Anxious', 'Peaceful', 'Happy'];
    const entries = Array.from({ length: 84 }, (_, i) => entryOn(i, moods[Math.floor(rand() * 4)]));
    const outlook = moodOutlook(entries, TODAY);
    expect(outlook.reliable).toBe(false);
    expect(outlook.tomorrow).toBeNull();
    expect(outlook.weekdays).toHaveLength(7);
  });

  it('never beats the average by a fluke on a constant mood', () => {
    const entries = Array.from({ length: 40 }, (_, i) => entryOn(i, 'Peaceful'));
    const outlook = moodOutlook(entries, TODAY);
    expect(outlook.reliable).toBe(false);
    expect(outlook.trend.direction).toBe('steady');
  });
});

describe('backtestWeekdays', () => {
  it('is nearly perfect when weekday fully decides the score', () => {
    const days = Array.from({ length: 70 }, (_, i) => ({ day: 20000 + i, score: weekdayOf(20000 + i) < 5 ? 2 : -2 }));
    expect(backtestWeekdays(days).improvement).toBeGreaterThan(0.7);
  });
});

describe('recentTrend', () => {
  function series(scoreOf, count = 28) {
    return Array.from({ length: count }, (_, i) => ({ day: dayNumber(TODAY) - (count - 1 - i), score: scoreOf(i) }));
  }

  it('calls a steady climb rising and a steady slide falling', () => {
    expect(recentTrend(series((i) => -2 + i * 0.14), TODAY).direction).toBe('rising');
    expect(recentTrend(series((i) => 2 - i * 0.14), TODAY).direction).toBe('falling');
  });

  it('calls wobble steady, and needs enough recent days', () => {
    expect(recentTrend(series((i) => (i % 2 ? 1 : -1)), TODAY).direction).toBe('steady');
    expect(recentTrend(series((i) => i, 5), TODAY).direction).toBe('unknown');
  });

  it('only looks at the last four weeks', () => {
    const old = Array.from({ length: 30 }, (_, i) => ({ day: dayNumber(TODAY) - 100 - i, score: -2 }));
    const recent = series(() => 1);
    expect(recentTrend([...old, ...recent], TODAY).days).toBe(28);
  });
});
