import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  applyFilters,
  getFilterOptions,
  hasActiveFilters,
  toggleFilter,
} from '../../src/lib/entryFilters.js';

const entries = [
  { id: 1, mood: 'Sad', weatherType: 'Rain', tags: ['Work'] },
  { id: 2, mood: 'Happy', weatherType: 'Clear sky', tags: ['travel', 'family'] },
  { id: 3, mood: 'Sad', weatherType: 'Clear sky', tags: [] },
  { id: 4, mood: 'Excited', weatherType: 'Rain', tags: ['Travel '] },
  { id: 5, content: 'no mood, weather, or tags' },
];

function ids(list) {
  return list.map((e) => e.id);
}

describe('getFilterOptions', () => {
  it('offers only the moods, weather, and tags that entries use', () => {
    const options = getFilterOptions(entries);

    expect(options.moods).toEqual(['Happy', 'Sad', 'Excited']); // MOODS order
    expect(options.weather).toEqual(['Clear sky', 'Rain']);
    expect(options.tags).toEqual([
      { key: 'family', label: 'family' },
      { key: 'travel', label: 'travel' },
      { key: 'work', label: 'Work' },
    ]);
  });

  it('returns empty groups when there are no entries', () => {
    expect(getFilterOptions([])).toEqual({ moods: [], weather: [], tags: [] });
  });
});

describe('applyFilters', () => {
  it('returns every entry when nothing is selected', () => {
    expect(applyFilters(entries, EMPTY_FILTERS)).toBe(entries);
  });

  it('matches any selected value within a group', () => {
    expect(ids(applyFilters(entries, { ...EMPTY_FILTERS, moods: ['Happy', 'Excited'] }))).toEqual([2, 4]);
  });

  it('requires every group with a selection to match', () => {
    const filters = { ...EMPTY_FILTERS, moods: ['Sad'], weather: ['Rain'] };
    expect(ids(applyFilters(entries, filters))).toEqual([1]);
  });

  it('matches tags regardless of case and surrounding spaces', () => {
    expect(ids(applyFilters(entries, { ...EMPTY_FILTERS, tags: ['travel'] }))).toEqual([2, 4]);
  });
});

describe('toggleFilter / hasActiveFilters', () => {
  it('adds a value, then removes it on a second toggle', () => {
    const on = toggleFilter(EMPTY_FILTERS, 'weather', 'Rain');
    expect(on.weather).toEqual(['Rain']);
    expect(hasActiveFilters(on)).toBe(true);

    const off = toggleFilter(on, 'weather', 'Rain');
    expect(off.weather).toEqual([]);
    expect(hasActiveFilters(off)).toBe(false);
  });

  it('does not mutate the filters it was given', () => {
    toggleFilter(EMPTY_FILTERS, 'moods', 'Happy');
    expect(EMPTY_FILTERS.moods).toEqual([]);
  });
});
