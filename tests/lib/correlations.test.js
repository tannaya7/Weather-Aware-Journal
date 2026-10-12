import { describe, expect, it } from 'vitest';
import {
  adjustPValues,
  analyzeCorrelations,
  dataCoverage,
  describeStrength,
  incompleteBeta,
  ranks,
  spearman,
  tTwoSidedP,
} from '../../src/lib/correlations.js';

// Small deterministic generator so the data is the same every run.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function entry(dayOffset, mood, extra = {}) {
  return { id: `e${dayOffset}-${mood}`, date: new Date(2026, 5, 1 + dayOffset, 12).toISOString(), mood, ...extra };
}

describe('statistics helpers', () => {
  it('ranks values and shares the average rank between ties', () => {
    expect(ranks([10, 30, 20])).toEqual([1, 3, 2]);
    expect(ranks([5, 5, 1, 9])).toEqual([2.5, 2.5, 1, 4]);
  });

  it('computes the incomplete beta function', () => {
    expect(incompleteBeta(0.5, 1, 1)).toBeCloseTo(0.5, 10);
    expect(incompleteBeta(0.3, 2, 2)).toBeCloseTo(0.216, 6); // 3x^2 - 2x^3
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(1, 2, 3)).toBe(1);
  });

  it('matches published Student t two-sided p-values', () => {
    expect(tTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(tTwoSidedP(2.086, 20)).toBeCloseTo(0.05, 3);
    expect(tTwoSidedP(0, 12)).toBeCloseTo(1, 10);
  });

  it('adjusts p-values with Benjamini-Hochberg', () => {
    const q = adjustPValues([0.01, 0.04, 0.03, 0.005]);
    expect(q[0]).toBeCloseTo(0.02, 10);
    expect(q[1]).toBeCloseTo(0.04, 10);
    expect(q[2]).toBeCloseTo(0.04, 10);
    expect(q[3]).toBeCloseTo(0.02, 10);
    expect(adjustPValues([0.9])).toEqual([0.9]);
  });

  it('labels strengths in plain words', () => {
    expect(describeStrength(0.05)).toBe('negligible');
    expect(describeStrength(-0.2)).toBe('weak');
    expect(describeStrength(0.4)).toBe('moderate');
    expect(describeStrength(-0.8)).toBe('strong');
  });
});

describe('spearman', () => {
  it('is 1 or -1 for perfectly monotone data, even when not linear', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(spearman(xs, xs.map((x) => x ** 3)).rho).toBeCloseTo(1, 10);
    expect(spearman(xs, xs.map((x) => -x)).rho).toBeCloseTo(-1, 10);
  });

  it('matches a hand-computed value, p-value, and interval', () => {
    // Ranks of ys are 2,1,4,3,6,5,8,7,10,9,12,11: every d is +-1, so
    // sum d^2 = 12 and rho = 1 - 6*12/(12*143) = 0.958041958...
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const ys = [2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11];
    const r = spearman(xs, ys);
    expect(r.n).toBe(12);
    expect(r.rho).toBeCloseTo(0.958041958, 8);
    expect(r.p).toBeLessThan(0.0001);
    expect(r.ci[0]).toBeLessThan(r.rho);
    expect(r.ci[1]).toBeGreaterThan(r.rho);
    expect(r.ci[1]).toBeLessThanOrEqual(1);
  });

  it('gives the textbook p-value for a moderate correlation', () => {
    // rho = 0.5, n = 12: t = 0.5*sqrt(10/0.75) = 1.8257, df = 10 -> p ~ 0.098.
    expect(tTwoSidedP(0.5 * Math.sqrt(10 / 0.75), 10)).toBeCloseTo(0.098, 3);
  });

  it('returns null when it cannot be computed', () => {
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeNull(); // too few
    expect(spearman([1, 1, 1, 1, 1], [1, 2, 3, 4, 5])).toBeNull(); // constant
    expect(spearman([1, 2, 3, 4], [1, 2, 3])).toBeNull(); // mismatched
  });

  it('finds no relationship in unrelated noise', () => {
    const rand = rng(7);
    const xs = Array.from({ length: 60 }, rand);
    const ys = Array.from({ length: 60 }, rand);
    const r = spearman(xs, ys);
    expect(Math.abs(r.rho)).toBeLessThan(0.3);
    expect(r.p).toBeGreaterThan(0.01);
  });
});

describe('analyzeCorrelations', () => {
  const MOOD_BY_LEVEL = ['Sad', 'Anxious', 'Peaceful', 'Happy'];

  function sunnyMoodEntries(n = 60) {
    const rand = rng(42);
    return Array.from({ length: n }, (_, i) => {
      const daylight = 8 + (i % 30) * 0.3;
      // Mood climbs with daylight plus noise.
      const level = Math.min(3, Math.max(0, Math.round((daylight - 8) / 3 + (rand() - 0.5) * 1.2)));
      return entry(i, MOOD_BY_LEVEL[level], { daylightHours: daylight, temperature: `${Math.round(rand() * 30)}°C` });
    });
  }

  it('finds a real daylight effect and calls it clear', () => {
    const results = analyzeCorrelations(sunnyMoodEntries(), { lags: [0] });
    const daylight = results.find((r) => r.factor.id === 'daylight');
    expect(daylight.rho).toBeGreaterThan(0.5);
    expect(daylight.confidence).toBe('clear');
    expect(daylight.summary).toBe('Your mood tends to be higher on days with more daylight.');
    expect(daylight.n).toBe(60);
    expect(results[0].factor.id).toBe('daylight');
  });

  it('does not call random temperature a pattern', () => {
    const results = analyzeCorrelations(sunnyMoodEntries(), { lags: [0] });
    const temp = results.find((r) => r.factor.id === 'temperature');
    expect(temp.confidence).not.toBe('clear');
  });

  it('skips factors without enough paired days', () => {
    const few = sunnyMoodEntries(8);
    expect(analyzeCorrelations(few)).toEqual([]);
    expect(dataCoverage(few)).toEqual({ moodDays: 8, enough: false });
    expect(dataCoverage(sunnyMoodEntries(20)).enough).toBe(true);
  });

  it('compares yesterday with today for lag 1', () => {
    // Mood today follows last night's sleep; sleep itself is random.
    const rand = rng(3);
    const sleeps = Array.from({ length: 50 }, () => Math.round(4 + rand() * 6));
    const entries = sleeps.map((s, i) => {
      const prev = i === 0 ? 7 : sleeps[i - 1];
      const mood = MOOD_BY_LEVEL[Math.min(3, Math.max(0, prev - 5))];
      return entry(i, mood, { habits: { sleep: s } });
    });
    const habits = [{ id: 'sleep', name: 'Sleep', type: 'number', unit: 'hours' }];
    const results = analyzeCorrelations(entries, { habits });
    const same = results.find((r) => r.factor.id === 'habit-sleep' && r.lag === 0);
    const next = results.find((r) => r.factor.id === 'habit-sleep' && r.lag === 1);
    expect(next.rho).toBeGreaterThan(0.8);
    expect(next.summary).toBe('Your mood tends to be higher the day after more sleep.');
    expect(Math.abs(same.rho)).toBeLessThan(0.4);
  });

  it('does not pair across missing days for lag 1', () => {
    // Every other day only, so no day has a day before it.
    const entries = Array.from({ length: 40 }, (_, i) =>
      entry(i * 2, MOOD_BY_LEVEL[i % 4], { daylightHours: 8 + (i % 7) }),
    );
    expect(analyzeCorrelations(entries, { lags: [1] })).toEqual([]);
  });

  it('handles yes/no factors and needs both kinds of day', () => {
    const entries = Array.from({ length: 40 }, (_, i) =>
      entry(i, i % 2 ? 'Happy' : 'Sad', { weatherType: i % 2 ? 'Clear sky' : 'Rain' }),
    );
    const wet = analyzeCorrelations(entries, { lags: [0] }).find((r) => r.factor.id === 'weather-wet');
    expect(wet.rho).toBeLessThan(-0.9);
    expect(wet.summary).toBe('Your mood tends to be lower on days with wet weather.');

    const allRain = entries.map((e) => ({ ...e, weatherType: 'Rain' }));
    expect(analyzeCorrelations(allRain, { lags: [0] }).find((r) => r.factor.id === 'weather-wet')).toBeUndefined();
  });

  it('averages entries on one day and ignores bad dates and missing moods', () => {
    const entries = [
      ...sunnyMoodEntries(30),
      { id: 'bad', date: 'nope', mood: 'Happy', daylightHours: 12 },
      entry(5, undefined, { daylightHours: 20 }),
    ];
    const results = analyzeCorrelations(entries, { lags: [0] });
    expect(results.find((r) => r.factor.id === 'daylight').n).toBe(30);
  });

  it('returns q-values between p and 1, sorted best first', () => {
    const results = analyzeCorrelations(sunnyMoodEntries(), { lags: [0, 1] });
    expect(results.length).toBeGreaterThan(2);
    for (const r of results) {
      expect(r.q).toBeLessThanOrEqual(1);
      expect(r.q).toBeGreaterThanOrEqual(r.p);
    }
    for (let i = 1; i < results.length; i++) expect(results[i].q).toBeGreaterThanOrEqual(results[i - 1].q);
  });
});
