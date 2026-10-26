// Weekly habit goals, kept in the habit config as
//   goals: { [habitId]: { days, direction?, threshold? } }
// "days" is how many days a week the goal should be met (1-7). Yes/no
// habits are met on a day they are logged as done; number habits are met
// when the day's value reaches (atLeast) or stays under (atMost) the
// threshold. Weeks run Monday to Sunday. A day without a logged value never
// counts as met.

const DAY_MS = 86400000;
export const HISTORY_WEEKS = 8;

export function dayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

// Day number of the Monday that starts the week containing `day`.
function mondayOf(day) {
  // 1970-01-01 (day 0) was a Thursday, so Monday-based weekday = (day + 3) % 7.
  return day - ((((day + 3) % 7) + 7) % 7);
}

export function isValidGoal(goal, habit) {
  if (!goal || !Number.isInteger(goal.days) || goal.days < 1 || goal.days > 7) return false;
  if (habit.type === 'boolean') return true;
  return (
    (goal.direction === 'atLeast' || goal.direction === 'atMost') &&
    typeof goal.threshold === 'number' &&
    Number.isFinite(goal.threshold) &&
    goal.threshold >= 0
  );
}

export function describeGoal(goal, habit) {
  const times = `${goal.days} ${goal.days === 1 ? 'day' : 'days'} a week`;
  if (habit.type === 'boolean') return `${habit.name}: ${times}`;
  const how = goal.direction === 'atMost' ? 'at most' : 'at least';
  return `${habit.name}: ${how} ${goal.threshold} ${habit.unit} on ${times}`;
}

function meetsOnDay(goal, habit, dayEntries) {
  const values = dayEntries
    .map((e) => e.habits?.[habit.id])
    .filter((v) => v !== undefined && v !== null && v !== '');
  if (values.length === 0) return false;
  if (habit.type === 'boolean') return values.some((v) => v === true);
  const nums = values.map(Number).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return false;
  const day = nums.reduce((s, n) => s + n, 0) / nums.length;
  return goal.direction === 'atMost' ? day <= goal.threshold : day >= goal.threshold;
}

// The set of day numbers on which the goal was met.
function metDays(entries, habit, goal) {
  const byDay = new Map();
  for (const entry of entries) {
    const d = entry?.date ? new Date(entry.date) : null;
    if (!d || isNaN(d)) continue;
    const day = dayNumber(d);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(entry);
  }
  const met = new Set();
  for (const [day, dayEntries] of byDay) if (meetsOnDay(goal, habit, dayEntries)) met.add(day);
  return met;
}

function countInWeek(met, monday) {
  let n = 0;
  for (let d = monday; d < monday + 7; d++) if (met.has(d)) n++;
  return n;
}

// Progress toward one goal this week, the last few finished weeks, and how
// many finished weeks in a row the goal was reached.
export function goalProgress(entries, habit, goal, now = new Date()) {
  const met = metDays(entries, habit, goal);
  const today = dayNumber(now);
  const monday = mondayOf(today);

  const metThisWeek = countInWeek(met, monday);
  // Today still counts as a chance to log it.
  const daysLeft = monday + 7 - today;
  const achieved = metThisWeek >= goal.days;

  const history = [];
  for (let i = 1; i <= HISTORY_WEEKS; i++) {
    const weekStart = monday - i * 7;
    const count = countInWeek(met, weekStart);
    history.unshift({ weekStart, met: count, achieved: count >= goal.days });
  }

  let streak = 0;
  for (let i = history.length - 1; i >= 0 && history[i].achieved; i--) streak++;
  if (achieved) streak++;

  return {
    target: goal.days,
    metThisWeek,
    achieved,
    daysLeft,
    onTrack: achieved || metThisWeek + daysLeft >= goal.days,
    history,
    streakWeeks: streak,
    weekStart: monday,
  };
}

// Progress for every valid goal on a tracked habit.
export function allGoalProgress(entries, habits, goals = {}, now = new Date()) {
  return habits
    .filter((h) => isValidGoal(goals[h.id], h))
    .map((habit) => ({ habit, goal: goals[habit.id], progress: goalProgress(entries, habit, goals[habit.id], now) }));
}
