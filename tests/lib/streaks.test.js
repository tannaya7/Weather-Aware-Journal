import { describe, expect, it } from 'vitest';
import { computeStreaks } from '../../src/lib/streaks.js';

const TODAY = new Date(2026, 9, 5, 9, 0); // Oct 5, 2026, 9am

function entriesOn(...days) {
  // days: [month (0-based), day] pairs in 2026
  return days.map(([month, day], i) => ({ id: i, date: new Date(2026, month, day, 20, 0).toISOString() }));
}

describe('computeStreaks', () => {
  it('is all zeros with no entries', () => {
    expect(computeStreaks([], TODAY)).toEqual({ current: 0, longest: 0, wroteToday: false });
  });

  it('counts consecutive days ending today', () => {
    const result = computeStreaks(entriesOn([9, 3], [9, 4], [9, 5]), TODAY);
    expect(result).toEqual({ current: 3, longest: 3, wroteToday: true });
  });

  it('keeps the streak alive through today before you have written', () => {
    const result = computeStreaks(entriesOn([9, 3], [9, 4]), TODAY);
    expect(result.current).toBe(2);
    expect(result.wroteToday).toBe(false);
  });

  it('breaks the streak once a whole day is missed', () => {
    const result = computeStreaks(entriesOn([9, 1], [9, 2], [9, 3]), TODAY);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(3);
  });

  it('counts several entries on one day as a single day', () => {
    const entries = [
      { id: 1, date: new Date(2026, 9, 4, 8).toISOString() },
      { id: 2, date: new Date(2026, 9, 4, 22).toISOString() },
      { id: 3, date: new Date(2026, 9, 5, 7).toISOString() },
    ];
    expect(computeStreaks(entries, TODAY)).toMatchObject({ current: 2, longest: 2 });
  });

  it('finds the longest streak anywhere in history', () => {
    const entries = entriesOn([0, 1], [0, 2], [0, 3], [0, 4], [5, 10], [9, 5]);
    expect(computeStreaks(entries, TODAY)).toMatchObject({ current: 1, longest: 4 });
  });

  it('counts runs across a month boundary', () => {
    const entries = entriesOn([8, 29], [8, 30], [9, 1]);
    expect(computeStreaks(entries, TODAY).longest).toBe(3);
  });

  it('ignores entries with missing or invalid dates', () => {
    const entries = [{ id: 1 }, { id: 2, date: 'not a date' }, ...entriesOn([9, 5])];
    expect(computeStreaks(entries, TODAY)).toEqual({ current: 1, longest: 1, wroteToday: true });
  });
});
