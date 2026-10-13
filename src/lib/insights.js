import { MOODS } from './moods.js';

// How good each mood feels, for averaging mood over time: positive moods
// above 0, low moods below. Averages are always shown next to a plain
// label (see describeMood), never as a bare number.
export const MOOD_SCORES = {
  Happy: 2,
  Excited: 2,
  Peaceful: 1,
  Anxious: -1,
  Sad: -2,
  Angry: -2,
};

const DAY_MS = 86400000;

function validDate(entry) {
  const d = entry?.date ? new Date(entry.date) : null;
  return d && !isNaN(d) ? d : null;
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // weeks start on Monday
  d.setDate(d.getDate() - offset);
  return d;
}

// Average mood per week for the last `weeks` weeks (oldest first). Weeks
// without a mood entry have average null, so the line shows a gap there
// instead of inventing a value.
export function weeklyMoodTrend(entries, { weeks = 26, now = new Date() } = {}) {
  const firstWeek = startOfWeek(now);
  firstWeek.setDate(firstWeek.getDate() - (weeks - 1) * 7);

  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(firstWeek);
    start.setDate(start.getDate() + i * 7);
    return { start, total: 0, count: 0 };
  });

  for (const entry of entries) {
    const score = MOOD_SCORES[entry.mood];
    const d = validDate(entry);
    if (score === undefined || !d) continue;
    // Rounded: a daylight-saving change makes a "week" 1 hour short or long.
    const index = Math.round((startOfWeek(d) - firstWeek) / (7 * DAY_MS));
    if (index < 0 || index >= weeks) continue;
    buckets[index].total += score;
    buckets[index].count += 1;
  }

  return buckets.map(({ start, total, count }) => ({
    weekStart: start,
    count,
    average: count ? total / count : null,
  }));
}

// "18°C" -> 18. Temperatures are stored as display strings.
export function parseTemperature(value) {
  if (typeof value === 'number') return value;
  const match = /-?\d+(\.\d+)?/.exec(value || '');
  return match ? Number(match[0]) : null;
}

// A plain-language name for an average mood score.
export function describeMood(average) {
  if (average === null || average === undefined) return 'No entries';
  if (average >= 1.25) return 'Great';
  if (average >= 0.5) return 'Good';
  if (average > -0.5) return 'Mixed';
  if (average > -1.25) return 'Low';
  return 'Very low';
}

// Average temperature on days with each mood, for moods with weather data,
// in the app's usual mood order.
export function moodByTemperature(entries) {
  const stats = new Map();
  for (const entry of entries) {
    const temp = parseTemperature(entry.temperature);
    if (!entry.mood || temp === null) continue;
    const s = stats.get(entry.mood) || { total: 0, count: 0 };
    s.total += temp;
    s.count += 1;
    stats.set(entry.mood, s);
  }

  return MOODS.filter((m) => stats.has(m.value)).map((m) => {
    const { total, count } = stats.get(m.value);
    return { mood: m.value, emoji: m.emoji, averageTemp: total / count, count };
  });
}

// Entries written on this calendar day in earlier years, most recent first.
export function onThisDay(entries, today = new Date()) {
  return entries
    .map((entry) => ({ entry, d: validDate(entry) }))
    .filter(
      ({ d }) =>
        d &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate() &&
        d.getFullYear() < today.getFullYear(),
    )
    .sort((a, b) => b.d - a.d)
    .map(({ entry, d }) => ({ entry, yearsAgo: today.getFullYear() - d.getFullYear() }));
}
