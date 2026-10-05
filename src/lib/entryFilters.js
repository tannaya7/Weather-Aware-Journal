import { MOODS } from './moods.js';

export const EMPTY_FILTERS = { moods: [], weather: [], tags: [] };

// Tags are typed free-form, so "Travel" and "travel " should filter as one.
export function tagKey(tag) {
  return tag.trim().toLowerCase();
}

// The chips to offer: only moods, weather types, and tags that at least one
// entry actually uses, so no chip ever leads to an empty list. Moods keep
// the app's fixed MOODS order; weather and tags are alphabetical. A tag's
// label is the first spelling seen.
export function getFilterOptions(entries) {
  const usedMoods = new Set();
  const weather = new Set();
  const tagLabels = new Map();

  for (const entry of entries) {
    if (entry.mood) usedMoods.add(entry.mood);
    if (entry.weatherType) weather.add(entry.weatherType);
    for (const tag of entry.tags || []) {
      const key = tagKey(tag);
      if (key && !tagLabels.has(key)) tagLabels.set(key, tag.trim());
    }
  }

  return {
    moods: MOODS.map((m) => m.value).filter((mood) => usedMoods.has(mood)),
    weather: [...weather].sort((a, b) => a.localeCompare(b)),
    tags: [...tagLabels]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export function hasActiveFilters(filters) {
  return filters.moods.length > 0 || filters.weather.length > 0 || filters.tags.length > 0;
}

// Within a group, any selected chip matches (Happy OR Excited); across
// groups, every group with a selection must match (Rain AND Sad).
export function applyFilters(entries, filters) {
  if (!hasActiveFilters(filters)) return entries;

  return entries.filter((entry) => {
    if (filters.moods.length && !filters.moods.includes(entry.mood)) return false;
    if (filters.weather.length && !filters.weather.includes(entry.weatherType)) return false;
    if (filters.tags.length) {
      const keys = (entry.tags || []).map(tagKey);
      if (!filters.tags.some((tag) => keys.includes(tag))) return false;
    }
    return true;
  });
}

export function toggleFilter(filters, group, value) {
  const current = filters[group];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...filters, [group]: next };
}
