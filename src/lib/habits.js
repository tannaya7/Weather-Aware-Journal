import { MOOD_SCORES } from './insights.js';

// Quick daily check-ins logged next to mood. Number habits use the
// median split (days above vs. at-or-below your usual); yes/no habits
// compare days with vs. without.
export const DEFAULT_HABITS = [
  { id: 'sleep', name: 'Sleep', emoji: '😴', type: 'number', unit: 'hours', min: 0, max: 24, step: 0.5 },
  { id: 'exercise', name: 'Exercise', emoji: '🏃', type: 'boolean' },
  { id: 'water', name: 'Water', emoji: '💧', type: 'number', unit: 'glasses', min: 0, max: 30, step: 1 },
  { id: 'screen', name: 'Screen time', emoji: '📱', type: 'number', unit: 'hours', min: 0, max: 24, step: 0.5 },
];

export const DEFAULT_HABIT_CONFIG = {
  enabled: DEFAULT_HABITS.map((h) => h.id),
  custom: [],
};

// Below this many days on either side, a comparison is just noise.
export const MIN_DAYS_EACH_SIDE = 3;

export function allHabits(config = DEFAULT_HABIT_CONFIG) {
  return [...DEFAULT_HABITS, ...(config.custom || [])];
}

export function enabledHabits(config = DEFAULT_HABIT_CONFIG) {
  const enabled = new Set(config.enabled || []);
  return allHabits(config).filter((h) => enabled.has(h.id));
}

export function makeCustomHabit(name, emoji = '✅') {
  return { id: `custom-${Date.now().toString(36)}`, name: name.trim(), emoji, type: 'boolean' };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function formatAmount(value, unit) {
  const n = Number.isInteger(value) ? value : value.toFixed(1);
  return `${n} ${unit}`;
}

// For each habit with enough data: average mood on its "more" days vs. its
// "less" days, sorted by how big the difference is. Correlation only, and
// the UI says so.
export function habitMoodEffects(entries, habits) {
  const effects = [];

  for (const habit of habits) {
    const logged = entries.filter(
      (e) => MOOD_SCORES[e.mood] !== undefined && e.habits && e.habits[habit.id] !== undefined && e.habits[habit.id] !== '',
    );

    let high;
    let low;
    let highLabel;
    let lowLabel;

    if (habit.type === 'boolean') {
      high = logged.filter((e) => e.habits[habit.id] === true);
      low = logged.filter((e) => e.habits[habit.id] === false);
      highLabel = 'Days with';
      lowLabel = 'Days without';
    } else {
      const values = logged.map((e) => Number(e.habits[habit.id])).filter((v) => !Number.isNaN(v));
      if (values.length < MIN_DAYS_EACH_SIDE * 2) continue;
      const mid = median(values);
      high = logged.filter((e) => Number(e.habits[habit.id]) > mid);
      low = logged.filter((e) => Number(e.habits[habit.id]) <= mid);
      highLabel = `More than ${formatAmount(mid, habit.unit)}`;
      lowLabel = `${formatAmount(mid, habit.unit)} or less`;
    }

    if (high.length < MIN_DAYS_EACH_SIDE || low.length < MIN_DAYS_EACH_SIDE) continue;

    const highAvg = average(high.map((e) => MOOD_SCORES[e.mood]));
    const lowAvg = average(low.map((e) => MOOD_SCORES[e.mood]));
    effects.push({
      habit,
      high: { label: highLabel, average: highAvg, days: high.length },
      low: { label: lowLabel, average: lowAvg, days: low.length },
      difference: highAvg - lowAvg,
    });
  }

  return effects.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

// Keeps only values for the given habits, as the right types, dropping
// blanks — what gets saved on an entry.
export function cleanHabitValues(values, habits) {
  const clean = {};
  for (const habit of habits) {
    const value = values?.[habit.id];
    if (value === undefined || value === null || value === '') continue;
    if (habit.type === 'boolean') clean[habit.id] = Boolean(value);
    else if (!Number.isNaN(Number(value))) clean[habit.id] = Number(value);
  }
  return Object.keys(clean).length ? clean : undefined;
}
