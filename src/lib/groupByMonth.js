import { getMonthKey, formatMonthLabel } from './dateFormat.js';

// Buckets an already-sorted list of entries into monthly sections for the
// timeline, preserving whatever order the entries arrived in.
export function groupEntriesByMonth(entries) {
  const groups = [];
  const groupsByKey = new Map();

  for (const entry of entries) {
    const key = getMonthKey(entry.date);
    let group = groupsByKey.get(key);
    if (!group) {
      group = { key, label: formatMonthLabel(entry.date), entries: [] };
      groupsByKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }

  return groups;
}
