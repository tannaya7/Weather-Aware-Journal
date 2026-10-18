import { MOODS, emojiForMood } from './moods.js';
import { iconForType } from './weatherApi.js';
import { computeStreaks } from './streaks.js';
import { parseTemperature } from './insights.js';
import { stripMarkdown } from './richText.js';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function dateOf(entry) {
  const d = entry?.date ? new Date(entry.date) : null;
  return d && !isNaN(d) ? d : null;
}

function top(counts) {
  let best = null;
  for (const [key, count] of counts) if (!best || count > best.count) best = { key, count };
  return best;
}

// Years that have at least one entry, newest first.
export function availableYears(entries) {
  const years = new Set();
  for (const entry of entries) {
    const d = dateOf(entry);
    if (d) years.add(d.getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

export function entriesInYear(entries, year) {
  return entries.filter((entry) => dateOf(entry)?.getFullYear() === year);
}

// Everything the year-in-review card shows, for one calendar year.
export function yearSummary(entries, year) {
  const inYear = entriesInYear(entries, year);

  const moodCounts = new Map();
  const weatherCounts = new Map();
  const monthCounts = new Map();
  const days = new Set();
  let words = 0;
  let warmest = null;
  let coldest = null;

  for (const entry of inYear) {
    const d = dateOf(entry);
    days.add(d.toDateString());
    monthCounts.set(d.getMonth(), (monthCounts.get(d.getMonth()) || 0) + 1);
    if (entry.mood) moodCounts.set(entry.mood, (moodCounts.get(entry.mood) || 0) + 1);
    if (entry.weatherType) weatherCounts.set(entry.weatherType, (weatherCounts.get(entry.weatherType) || 0) + 1);
    words += stripMarkdown(entry.content).split(/\s+/).filter(Boolean).length;
    const temp = parseTemperature(entry.temperature);
    if (temp !== null) {
      if (!warmest || temp > warmest.temp) warmest = { temp, date: d };
      if (!coldest || temp < coldest.temp) coldest = { temp, date: d };
    }
  }

  const topMood = top(moodCounts);
  const topWeather = top(weatherCounts);
  const busiest = top(monthCounts);

  return {
    year,
    entries: inYear.length,
    daysWritten: days.size,
    words,
    longestStreak: computeStreaks(inYear, new Date(year, 11, 31)).longest,
    topMood: topMood && { mood: topMood.key, emoji: emojiForMood(topMood.key), count: topMood.count },
    moodCounts: MOODS.map((m) => ({ mood: m.value, emoji: m.emoji, count: moodCounts.get(m.value) || 0 })),
    topWeather: topWeather && { type: topWeather.key, icon: iconForType(topWeather.key), count: topWeather.count },
    busiestMonth: busiest && { month: MONTHS[busiest.key], count: busiest.count },
    warmest,
    coldest,
  };
}

// --- The shareable image ---------------------------------------------------

export const REVIEW_SIZE = { width: 1080, height: 1350 }; // 4:5, fits social feeds

// Fixed colors (the image looks the same whatever theme you're in): the
// app's dark "candlelit" palette, with the chart amber validated for it.
const C = {
  bgTop: '#2a1e13',
  bgBottom: '#140d08',
  panel: 'rgba(255, 240, 220, 0.06)',
  text: '#f3e9da',
  muted: '#c9b79c',
  accent: '#dda15e',
  bar: '#b8772f',
  track: 'rgba(255, 240, 220, 0.08)',
};

const FONT = "'Poppins', 'Segoe UI', system-ui, sans-serif";
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Georgia, serif";

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function text(ctx, value, x, y, { size = 32, color = C.text, weight = 400, align = 'left', family = FONT } = {}) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

// Draws the year-in-review card onto a 2D canvas context. Pure drawing, no
// DOM, so it can be tested with a recording context.
export function drawYearReview(ctx, summary) {
  const { width, height } = REVIEW_SIZE;
  const pad = 80;

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, C.bgTop);
  bg.addColorStop(1, C.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  text(ctx, '🌥️  Weather Journal', pad, 120, { size: 34, color: C.muted, weight: 600 });
  text(ctx, `My ${summary.year}`, pad, 230, { size: 96, weight: 700, family: SERIF });
  text(ctx, 'in review', pad, 300, { size: 48, color: C.accent, family: SERIF });

  // Four stat panels in a 2x2 grid.
  const stats = [
    [summary.entries.toLocaleString(), summary.entries === 1 ? 'entry' : 'entries'],
    [summary.daysWritten.toLocaleString(), summary.daysWritten === 1 ? 'day written' : 'days written'],
    [summary.longestStreak.toLocaleString(), 'longest streak (days)'],
    [summary.words.toLocaleString(), summary.words === 1 ? 'word' : 'words'],
  ];
  const gap = 24;
  const panelW = (width - pad * 2 - gap) / 2;
  const panelH = 150;
  stats.forEach(([value, label], i) => {
    const x = pad + (i % 2) * (panelW + gap);
    const y = 360 + Math.floor(i / 2) * (panelH + gap);
    ctx.fillStyle = C.panel;
    rounded(ctx, x, y, panelW, panelH, 24);
    text(ctx, value, x + 32, y + 78, { size: 56, weight: 700 });
    text(ctx, label, x + 32, y + 120, { size: 28, color: C.muted });
  });

  // Highlights.
  let y = 760;
  const line = (icon, label, value) => {
    text(ctx, icon, pad, y, { size: 40 });
    text(ctx, label, pad + 64, y, { size: 30, color: C.muted });
    text(ctx, value, width - pad, y, { size: 32, weight: 600, align: 'right' });
    y += 64;
  };
  if (summary.topMood) line(summary.topMood.emoji, 'Most common mood', summary.topMood.mood);
  if (summary.topWeather) line(summary.topWeather.icon, 'Most common weather', summary.topWeather.type);
  if (summary.busiestMonth) line('📅', 'Busiest month', summary.busiestMonth.month);
  if (summary.warmest && summary.coldest && summary.warmest.temp !== summary.coldest.temp) {
    line('🌡️', 'Temperature range', `${Math.round(summary.coldest.temp)}° to ${Math.round(summary.warmest.temp)}°C`);
  }

  // Mood bars: one hue, length = count, each labeled with its count.
  const barsTop = Math.max(y + 10, 1030);
  const maxCount = Math.max(1, ...summary.moodCounts.map((m) => m.count));
  const barX = pad + 64;
  const barMax = width - pad - barX - 70;
  const rowH = (height - barsTop - 70) / summary.moodCounts.length;
  summary.moodCounts.forEach((m, i) => {
    const rowY = barsTop + i * rowH;
    text(ctx, m.emoji, pad, rowY + rowH / 2 + 12, { size: 30 });
    ctx.fillStyle = C.track;
    rounded(ctx, barX, rowY + rowH / 2 - 8, barMax, 16, 8);
    if (m.count > 0) {
      ctx.fillStyle = C.bar;
      rounded(ctx, barX, rowY + rowH / 2 - 8, Math.max(16, (m.count / maxCount) * barMax), 16, 8);
    }
    text(ctx, String(m.count), width - pad, rowY + rowH / 2 + 10, { size: 26, color: C.muted, align: 'right' });
  });
}
