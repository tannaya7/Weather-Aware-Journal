import { MOODS } from './moods.js';

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Maps "YYYY-MM-DD" -> { mood, entryId } for every day that has at least one
// entry with a mood. When a day has multiple entries, the earliest one wins
// so the mapping is stable rather than depending on render order.
export function buildDayMoodMap(entries) {
  const map = new Map();
  const chronological = [...entries]
    .filter((e) => e.mood && e.date && !isNaN(new Date(e.date)))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const entry of chronological) {
    const key = dayKey(new Date(entry.date));
    if (!map.has(key)) {
      map.set(key, { mood: entry.mood, entryId: entry.id });
    }
  }

  return map;
}

// One flat array of 7*N cells (padded with null before day 1 and after the
// last day) for a month's grid, 0-indexed month (0 = January).
export function getMonthGridCells(year, month) {
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = new Array(startOffset).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, key });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

// Counts entries per mood within a given calendar year, in MOODS order, for
// the yearly bar graph.
export function computeYearlyMoodCounts(entries, year) {
  const counts = Object.fromEntries(MOODS.map((m) => [m.value, 0]));

  for (const entry of entries) {
    if (!entry.mood || !entry.date) continue;
    const d = new Date(entry.date);
    if (isNaN(d) || d.getFullYear() !== year) continue;
    if (counts[entry.mood] !== undefined) counts[entry.mood] += 1;
  }

  return MOODS.map((m) => ({ mood: m.value, emoji: m.emoji, count: counts[m.value] }));
}
