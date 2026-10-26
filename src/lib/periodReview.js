import { MOODS } from './moods.js';
import { MOOD_SCORES, describeMood, parseTemperature } from './insights.js';
import { iconForType } from './weatherApi.js';
import { stripMarkdown } from './richText.js';
import { allGoalProgress, dayNumber } from './goals.js';
import {
  REVIEW_COLORS,
  REVIEW_SERIF,
  REVIEW_SIZE,
  drawRounded,
  drawText,
} from './yearReview.js';

// Weekly (Monday to Sunday) and monthly reviews: the same idea as the year
// in review, for a shorter stretch. A period is
//   { kind, key, start, end, label }   with end exclusive.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

function dateOf(entry) {
  const d = entry?.date ? new Date(entry.date) : null;
  return d && !isNaN(d) ? d : null;
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function weekLabel(start, end) {
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const from = `${start.getDate()} ${SHORT_MONTHS[start.getMonth()]}`;
  const to = `${last.getDate()} ${SHORT_MONTHS[last.getMonth()]} ${last.getFullYear()}`;
  return `${from} – ${to}`;
}

export function periodOf(kind, date) {
  if (kind === 'week') {
    const start = startOfWeek(date);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    return { kind, key: `w-${dayNumber(start)}`, start, end, label: weekLabel(start, end) };
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    kind: 'month',
    key: `m-${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    start,
    end,
    label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
  };
}

function previousPeriod(period) {
  return periodOf(period.kind, new Date(period.start.getFullYear(), period.start.getMonth(), period.start.getDate() - 1));
}

// Periods of `kind` that have at least one entry, newest first.
export function availablePeriods(entries, kind) {
  const found = new Map();
  for (const entry of entries) {
    const d = dateOf(entry);
    if (!d) continue;
    const period = periodOf(kind, d);
    found.set(period.key, period);
  }
  return [...found.values()].sort((a, b) => b.start - a.start);
}

export function entriesInPeriod(entries, period) {
  return entries.filter((entry) => {
    const d = dateOf(entry);
    return d && d >= period.start && d < period.end;
  });
}

function averageMood(periodEntries) {
  const scores = periodEntries.map((e) => MOOD_SCORES[e.mood]).filter((s) => s !== undefined);
  return scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
}

function dayHighlights(periodEntries) {
  const days = new Map();
  for (const entry of periodEntries) {
    const d = dateOf(entry);
    const score = MOOD_SCORES[entry.mood];
    if (!d || score === undefined) continue;
    const key = dayNumber(d);
    const cur = days.get(key) || { date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), total: 0, count: 0 };
    cur.total += score;
    cur.count += 1;
    days.set(key, cur);
  }
  const list = [...days.values()]
    .map((d) => ({ date: d.date, score: d.total / d.count }))
    .sort((a, b) => a.date - b.date);
  if (list.length < 2) return { best: null, hardest: null };
  let best = list[0];
  let hardest = list[0];
  for (const d of list) {
    if (d.score > best.score) best = d;
    if (d.score < hardest.score) hardest = d;
  }
  if (best.score === hardest.score) return { best: null, hardest: null };
  const shape = (d) => ({ date: d.date, score: d.score, label: describeMood(d.score) });
  return { best: shape(best), hardest: shape(hardest) };
}

export function formatDay(date) {
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

// Everything a review shows for one period. `habits` and `goals` add the
// weekly goal results (weekly reviews only: goals are weekly).
export function periodSummary(entries, period, { habits = [], goals = {} } = {}) {
  const inPeriod = entriesInPeriod(entries, period);
  const days = new Set();
  const moodCounts = new Map();
  const weatherCounts = new Map();
  let words = 0;
  let coldest = null;
  let warmest = null;

  for (const entry of inPeriod) {
    days.add(dayNumber(dateOf(entry)));
    if (entry.mood) moodCounts.set(entry.mood, (moodCounts.get(entry.mood) || 0) + 1);
    if (entry.weatherType) weatherCounts.set(entry.weatherType, (weatherCounts.get(entry.weatherType) || 0) + 1);
    words += stripMarkdown(entry.content).split(/\s+/).filter(Boolean).length;
    const temp = parseTemperature(entry.temperature);
    if (temp !== null) {
      if (coldest === null || temp < coldest) coldest = temp;
      if (warmest === null || temp > warmest) warmest = temp;
    }
  }

  let topWeather = null;
  for (const [type, count] of weatherCounts) {
    if (!topWeather || count > topWeather.count) topWeather = { type, icon: iconForType(type), count };
  }

  const average = averageMood(inPeriod);
  const previousAverage = averageMood(entriesInPeriod(entries, previousPeriod(period)));
  const { best, hardest } = dayHighlights(inPeriod);

  const goalResults =
    period.kind === 'week'
      ? allGoalProgress(entries, habits, goals, new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() - 1)).map(
          ({ habit, goal, progress }) => ({
            habit,
            goal,
            met: progress.metThisWeek,
            target: progress.target,
            achieved: progress.achieved,
          }),
        )
      : [];

  return {
    period,
    entries: inPeriod.length,
    daysWritten: days.size,
    words,
    averageMood: average === null ? null : { score: average, label: describeMood(average) },
    previousMood: previousAverage === null ? null : { score: previousAverage, label: describeMood(previousAverage) },
    moodCounts: MOODS.map((m) => ({ mood: m.value, emoji: m.emoji, count: moodCounts.get(m.value) || 0 })),
    bestDay: best,
    hardestDay: hardest,
    topWeather,
    temperatureRange: coldest !== null && warmest !== null && coldest !== warmest ? { min: coldest, max: warmest } : null,
    goals: goalResults,
  };
}

// "Up from Good" / "Down from Good" / "Same as Good" against the period
// before, or null if either period has no mood.
export function compareWithPrevious(summary) {
  if (!summary.averageMood || !summary.previousMood) return null;
  const diff = summary.averageMood.score - summary.previousMood.score;
  const before = summary.previousMood.label;
  if (summary.averageMood.label === before || Math.abs(diff) < 0.25) return `About the same as before (${before})`;
  return `${diff > 0 ? 'Up' : 'Down'} from ${before}`;
}

// --- The shareable image ---------------------------------------------------

const MAX_HIGHLIGHTS = 5;

// Draws the review onto a 2D canvas context, like drawYearReview.
export function drawPeriodReview(ctx, summary) {
  const { width, height } = REVIEW_SIZE;
  const pad = 80;
  const C = REVIEW_COLORS;
  const isWeek = summary.period.kind === 'week';

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, C.bgTop);
  bg.addColorStop(1, C.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawText(ctx, '🌥️  Weather Journal', pad, 120, { size: 34, color: C.muted, weight: 600 });
  drawText(ctx, isWeek ? 'My week' : summary.period.label.split(' ')[0], pad, 230, {
    size: 96,
    weight: 700,
    family: REVIEW_SERIF,
  });
  drawText(ctx, isWeek ? summary.period.label : summary.period.label.split(' ')[1], pad, 300, {
    size: 44,
    color: C.accent,
    family: REVIEW_SERIF,
  });

  const stats = [
    [summary.entries.toLocaleString(), summary.entries === 1 ? 'entry' : 'entries'],
    [summary.daysWritten.toLocaleString(), summary.daysWritten === 1 ? 'day written' : 'days written'],
    [summary.words.toLocaleString(), summary.words === 1 ? 'word' : 'words'],
    [summary.averageMood ? summary.averageMood.label : '–', 'average mood'],
  ];
  const gap = 24;
  const panelW = (width - pad * 2 - gap) / 2;
  const panelH = 150;
  stats.forEach(([value, label], i) => {
    const x = pad + (i % 2) * (panelW + gap);
    const y = 360 + Math.floor(i / 2) * (panelH + gap);
    ctx.fillStyle = C.panel;
    drawRounded(ctx, x, y, panelW, panelH, 24);
    drawText(ctx, value, x + 32, y + 78, { size: 56, weight: 700 });
    drawText(ctx, label, x + 32, y + 120, { size: 28, color: C.muted });
  });

  // The most useful highlights first; five is all that fits above the bars.
  const lines = [];
  const trend = compareWithPrevious(summary);
  if (trend) lines.push(['📈', isWeek ? 'Vs. last week' : 'Vs. last month', trend.replace(/ \(.*\)$/, '')]);
  if (summary.bestDay) lines.push(['☀️', 'Best day', `${formatDay(summary.bestDay.date)} · ${summary.bestDay.label}`]);
  if (summary.hardestDay) lines.push(['🌧️', 'Hardest day', `${formatDay(summary.hardestDay.date)} · ${summary.hardestDay.label}`]);
  if (summary.topWeather) lines.push([summary.topWeather.icon, 'Most common weather', summary.topWeather.type]);
  for (const g of summary.goals) {
    lines.push([g.habit.emoji, `${g.habit.name} goal`, `${g.met}/${g.target} days${g.achieved ? ' ✓' : ''}`]);
  }
  if (summary.temperatureRange) {
    lines.push(['🌡️', 'Temperature range', `${Math.round(summary.temperatureRange.min)}° to ${Math.round(summary.temperatureRange.max)}°C`]);
  }

  let y = 750;
  for (const [icon, label, value] of lines.slice(0, MAX_HIGHLIGHTS)) {
    drawText(ctx, icon, pad, y, { size: 40 });
    drawText(ctx, label, pad + 64, y, { size: 30, color: C.muted });
    drawText(ctx, value, width - pad, y, { size: 32, weight: 600, align: 'right' });
    y += 54;
  }

  const barsTop = Math.max(y + 10, 1030);
  const maxCount = Math.max(1, ...summary.moodCounts.map((m) => m.count));
  const barX = pad + 64;
  const barMax = width - pad - barX - 70;
  const rowH = (height - barsTop - 70) / summary.moodCounts.length;
  summary.moodCounts.forEach((m, i) => {
    const rowY = barsTop + i * rowH;
    drawText(ctx, m.emoji, pad, rowY + rowH / 2 + 12, { size: 30 });
    ctx.fillStyle = C.track;
    drawRounded(ctx, barX, rowY + rowH / 2 - 8, barMax, 16, 8);
    if (m.count > 0) {
      ctx.fillStyle = C.bar;
      drawRounded(ctx, barX, rowY + rowH / 2 - 8, Math.max(16, (m.count / maxCount) * barMax), 16, 8);
    }
    drawText(ctx, String(m.count), width - pad, rowY + rowH / 2 + 10, { size: 26, color: C.muted, align: 'right' });
  });
}
