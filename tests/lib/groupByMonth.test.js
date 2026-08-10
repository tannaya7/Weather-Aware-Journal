import { describe, expect, it } from 'vitest';
import { groupEntriesByMonth } from '../../src/lib/groupByMonth.js';

describe('groupEntriesByMonth', () => {
  it('groups entries under a month label, preserving input order', () => {
    const entries = [
      { id: 1, date: '2025-11-28T10:00' },
      { id: 2, date: '2025-11-02T10:00' },
      { id: 3, date: '2025-10-15T10:00' },
    ];

    const groups = groupEntriesByMonth(entries);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ label: 'November 2025' });
    expect(groups[0].entries.map((e) => e.id)).toEqual([1, 2]);
    expect(groups[1]).toMatchObject({ label: 'October 2025' });
    expect(groups[1].entries.map((e) => e.id)).toEqual([3]);
  });

  it('returns an empty array for no entries', () => {
    expect(groupEntriesByMonth([])).toEqual([]);
  });

  it('buckets entries with an invalid date under "Undated"', () => {
    const groups = groupEntriesByMonth([{ id: 1, date: 'not-a-date' }]);
    expect(groups[0].label).toBe('Undated');
  });
});
