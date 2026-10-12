import { MOOD_SCORES, describeMood } from './insights.js';
import { spearman } from './correlations.js';
import { dayNumber } from './goals.js';

// A cautious look at where mood is heading: the recent direction, and
// which weekdays tend to be better or harder. The "tomorrow" tendency is
// only offered when weekday really predicts mood better than your overall
// average does, checked by leaving each day out and predicting it from the
// rest. If it cannot beat the average, we say so rather than guess.

export const MIN_OUTLOOK_DAYS = 28;
export const TREND_WINDOW_DAYS = 28;
export const MIN_TREND_DAYS = 10;
// How many same-weekday days it takes before that weekday's average is
// trusted as much as the overall one.
const SHRINK = 3;
// The weekday model must cut the average error by at least this share.
const MIN_IMPROVEMENT = 0.05;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// One average mood score per day with a mood: [{ day, score }], oldest first.
export function dailyMoods(entries) {
  const byDay = new Map();
  for (const entry of entries) {
    const score = MOOD_SCORES[entry?.mood];
    const d = entry?.date ? new Date(entry.date) : null;
    if (score === undefined || !d || isNaN(d)) continue;
    const day = dayNumber(d);
    const cur = byDay.get(day) || { total: 0, count: 0 };
    cur.total += score;
    cur.count += 1;
    byDay.set(day, cur);
  }
  return [...byDay.entries()]
    .map(([day, { total, count }]) => ({ day, score: total / count }))
    .sort((a, b) => a.day - b.day);
}

// Monday = 0 ... Sunday = 6 for a day number.
export function weekdayOf(day) {
  return (((day + 3) % 7) + 7) % 7;
}

function mean(values) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function weekdayStats(days) {
  const buckets = Array.from({ length: 7 }, () => []);
  for (const { day, score } of days) buckets[weekdayOf(day)].push(score);
  return buckets;
}

function predictFrom(buckets, overall, weekday) {
  const b = buckets[weekday];
  if (b.length === 0) return overall;
  return overall + (mean(b) - overall) * (b.length / (b.length + SHRINK));
}

// Leave-one-out error of the weekday model vs. the plain average.
export function backtestWeekdays(days) {
  let modelError = 0;
  let baseError = 0;
  for (let i = 0; i < days.length; i++) {
    const rest = days.filter((_, j) => j !== i);
    const overall = mean(rest.map((d) => d.score));
    const buckets = weekdayStats(rest);
    const guess = predictFrom(buckets, overall, weekdayOf(days[i].day));
    modelError += Math.abs(guess - days[i].score);
    baseError += Math.abs(overall - days[i].score);
  }
  const model = modelError / days.length;
  const baseline = baseError / days.length;
  return { model, baseline, improvement: baseline === 0 ? 0 : (baseline - model) / baseline };
}

// The last four weeks' direction, tested so a wobble isn't called a trend.
export function recentTrend(days, today) {
  const todayNumber = dayNumber(today);
  const recent = days.filter((d) => d.day > todayNumber - TREND_WINDOW_DAYS && d.day <= todayNumber);
  if (recent.length < MIN_TREND_DAYS) return { direction: 'unknown', days: recent.length };

  const stat = spearman(
    recent.map((d) => d.day),
    recent.map((d) => d.score),
  );
  if (!stat) return { direction: 'steady', days: recent.length, rho: 0, p: 1 };
  const significant = stat.p < 0.05 && Math.abs(stat.rho) >= 0.3;
  return {
    direction: !significant ? 'steady' : stat.rho > 0 ? 'rising' : 'falling',
    days: recent.length,
    rho: stat.rho,
    p: stat.p,
  };
}

export function moodOutlook(entries, today = new Date()) {
  const days = dailyMoods(entries);
  if (days.length < MIN_OUTLOOK_DAYS) {
    return { enough: false, moodDays: days.length, needed: MIN_OUTLOOK_DAYS };
  }

  const overall = mean(days.map((d) => d.score));
  const buckets = weekdayStats(days);
  const weekdays = buckets.map((scores, i) => ({
    weekday: WEEKDAYS[i],
    days: scores.length,
    average: scores.length ? mean(scores) : null,
  }));

  const test = backtestWeekdays(days);
  const reliable = test.improvement >= MIN_IMPROVEMENT;

  const tomorrowDay = dayNumber(today) + 1;
  const tomorrowWeekday = weekdayOf(tomorrowDay);
  const tomorrow = reliable
    ? {
        weekday: WEEKDAYS[tomorrowWeekday],
        expected: predictFrom(buckets, overall, tomorrowWeekday),
        label: describeMood(predictFrom(buckets, overall, tomorrowWeekday)),
        basedOn: buckets[tomorrowWeekday].length,
      }
    : null;

  return {
    enough: true,
    moodDays: days.length,
    overall,
    weekdays,
    reliable,
    improvement: test.improvement,
    tomorrow,
    trend: recentTrend(days, today),
  };
}
