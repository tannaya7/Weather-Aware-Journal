import { describe, expect, it } from 'vitest';
import {
  buildDayMoodMap,
  getMonthGridCells,
  computeYearlyMoodCounts,
} from '../../src/lib/calendarStats.js';

describe('buildDayMoodMap', () => {
  it('maps a day to the mood of its earliest entry', () => {
    const map = buildDayMoodMap([
      { id: 2, date: '2025-11-28T18:00', mood: 'Sad' },
      { id: 1, date: '2025-11-28T08:00', mood: 'Happy' },
    ]);
    expect(map.get('2025-11-28')).toEqual({ mood: 'Happy', entryId: 1 });
  });

  it('skips entries without a mood or date', () => {
    const map = buildDayMoodMap([{ id: 1, date: '2025-11-28T08:00' }, { id: 2, mood: 'Happy' }]);
    expect(map.size).toBe(0);
  });
});

describe('getMonthGridCells', () => {
  it('pads the front of the month to align with its starting weekday', () => {
    // November 2025 starts on a Saturday (day index 6)
    const cells = getMonthGridCells(2025, 10);
    expect(cells[0]).toBeNull();
    expect(cells[6]).toEqual({ day: 1, key: '2025-11-01' });
  });

  it('produces a cell count that is a multiple of 7', () => {
    const cells = getMonthGridCells(2025, 1); // February
    expect(cells.length % 7).toBe(0);
    expect(cells.filter(Boolean)).toHaveLength(28);
  });
});

describe('computeYearlyMoodCounts', () => {
  it('counts moods only within the given year, in a fixed order', () => {
    const result = computeYearlyMoodCounts(
      [
        { mood: 'Happy', date: '2025-01-01' },
        { mood: 'Happy', date: '2024-01-01' },
        { mood: 'Sad', date: '2025-06-01' },
      ],
      2025,
    );
    expect(result.map((r) => r.mood)).toEqual([
      'Happy',
      'Peaceful',
      'Sad',
      'Excited',
      'Angry',
      'Anxious',
    ]);
    expect(result.find((r) => r.mood === 'Happy').count).toBe(1);
    expect(result.find((r) => r.mood === 'Sad').count).toBe(1);
    expect(result.find((r) => r.mood === 'Peaceful').count).toBe(0);
  });
});
