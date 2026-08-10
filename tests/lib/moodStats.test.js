import { describe, expect, it } from 'vitest';
import { computeMoodCounts } from '../../src/lib/moodStats.js';

describe('computeMoodCounts', () => {
  it('counts and sorts moods by frequency descending', () => {
    const entries = [{ mood: 'Happy' }, { mood: 'Sad' }, { mood: 'Happy' }, { mood: 'Happy' }];
    const result = computeMoodCounts(entries);
    expect(result[0]).toMatchObject({ mood: 'Happy', count: 3 });
    expect(result[1]).toMatchObject({ mood: 'Sad', count: 1 });
  });

  it('computes percentages relative to the total', () => {
    const entries = [{ mood: 'Happy' }, { mood: 'Sad' }];
    const result = computeMoodCounts(entries);
    expect(result.every((r) => r.percent === 50)).toBe(true);
  });

  it('buckets missing moods under "Unknown"', () => {
    const result = computeMoodCounts([{}]);
    expect(result).toEqual([{ mood: 'Unknown', count: 1, percent: 100 }]);
  });

  it('returns an empty array for no entries', () => {
    expect(computeMoodCounts([])).toEqual([]);
  });
});
