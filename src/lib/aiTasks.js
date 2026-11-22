import { MOODS } from './moods.js';
import { parseTemperature } from './insights.js';
import { stripMarkdown } from './richText.js';

// The Gemini tasks (see worker/src/gemini.js). This file decides what is
// allowed to leave the device for each one. Each task is its own request.

export const AI_TASKS = {
  organization: 'entry_organization',
  dayPlan: 'weather_day_plan',
  writingPrompt: 'writing_prompt',
  periodReview: 'journal_period_review',
};

// A review needs at least this many entries in the period. The server
// enforces it too.
export const MIN_REVIEW_ENTRIES = 3;
export const MAX_RANGE_DAYS = 92;
// How much entry text a review sends: a short excerpt from at most this many
// entries, spread across the period.
export const MAX_EXCERPTS = 20;
export const EXCERPT_CHARS = 300;
// How much of a recent entry a writing prompt may use, if the person allows it.
export const PROMPT_RECENT_ENTRIES = 3;
const PROMPT_RECENT_CHARS = 240;

export const PLAN_PREFERENCES = ['none', 'quiet', 'outdoor', 'creative'];
// A forecast older than this is not used for a plan.
export const FORECAST_FRESH_MS = 3 * 60 * 60 * 1000;

export const REVIEW_PRESETS = [
  { days: 7, labelKey: 'ai.review.last7' },
  { days: 30, labelKey: 'ai.review.last30' },
  { days: 90, labelKey: 'ai.review.last90' },
];

const MOOD_VALUES = MOODS.map((m) => m.value);

// A weather label the server accepts (mirrors worker/src/gemini.js).
const LABEL = /^[\p{L}\p{N} ,.'()/-]{1,40}$/u;
const safeLabel = (value) =>
  typeof value === 'string' && LABEL.test(value.trim()) ? value.trim() : '';

const dayOf = (entry) => (typeof entry?.date === 'string' ? entry.date.slice(0, 10) : '');

const oneLine = (text, max) =>
  stripMarkdown(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// --- Entry organization ------------------------------------------------------

// One entry: its words, date, mood, and weather. Never photos, voice memos,
// place names, tags, or habits.
export function entryForAi(entry) {
  return {
    date: dayOf(entry),
    mood: MOOD_VALUES.includes(entry.mood) ? entry.mood : '',
    weather: [entry.weatherType, entry.temperature].filter(Boolean).join(', '),
    text: stripMarkdown(entry.content || ''),
  };
}

// --- Dates -------------------------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0');
}

export function localDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The last `days` days, ending today.
export function lastDays(days, now = new Date()) {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { from: localDay(start), to: localDay(now) };
}

// Whether a chosen period can be reviewed: real dates, not in the future,
// in order, and not longer than MAX_RANGE_DAYS.
export function checkRange({ from, to }, now = new Date()) {
  const valid = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
  if (!valid(from) || !valid(to) || from > to || to > localDay(now)) return false;
  const span = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  return span <= MAX_RANGE_DAYS;
}

// --- Period review -----------------------------------------------------------

function top(counts, limit) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

// Evenly spaced picks, so a long period is covered from start to end.
function spread(items, count) {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * items.length) / count)]);
}

// Counts worked out here, plus a short excerpt from some of the entries
// dated within the range (inclusive). Returns the request body for the
// server, and the numbers to show the person before they send it.
export function buildReviewRequest(entries, { from, to }, language = 'en') {
  const inRange = entries
    .filter((e) => {
      const d = dayOf(e);
      return d && d >= from && d <= to;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const moodCounts = {};
  const weatherCounts = new Map();
  const byWeather = new Map();
  const tempsByMood = new Map();
  let withWeather = 0;

  for (const entry of inRange) {
    const mood = MOOD_VALUES.includes(entry.mood) ? entry.mood : null;
    if (mood) moodCounts[mood] = (moodCounts[mood] || 0) + 1;

    const weather = safeLabel(entry.weatherType);
    if (weather) {
      withWeather += 1;
      weatherCounts.set(weather, (weatherCounts.get(weather) || 0) + 1);
      const row = byWeather.get(weather) || { weather, count: 0, moods: {} };
      row.count += 1;
      if (mood) row.moods[mood] = (row.moods[mood] || 0) + 1;
      byWeather.set(weather, row);
    }

    const temp = parseTemperature(entry.temperature);
    if (mood && temp !== null && temp >= -90 && temp <= 70) {
      const t = tempsByMood.get(mood) || { total: 0, count: 0 };
      t.total += temp;
      t.count += 1;
      tempsByMood.set(mood, t);
    }
  }

  const topWeather = top(weatherCounts, 12);
  const averageTemperatureByMood = {};
  for (const [mood, t] of tempsByMood)
    averageTemperatureByMood[mood] = Math.round((t.total / t.count) * 10) / 10;

  const excerpts = spread(inRange, MAX_EXCERPTS)
    .map((e) => ({
      date: dayOf(e),
      mood: MOOD_VALUES.includes(e.mood) ? e.mood : '',
      weather: safeLabel(e.weatherType),
      text: oneLine(e.content, EXCERPT_CHARS),
    }))
    .filter((e) => e.text);

  return {
    sampleSize: inRange.length,
    excerptCount: excerpts.length,
    request: {
      range: { from, to },
      language,
      summary: {
        sampleSize: inRange.length,
        daysWithEntries: new Set(inRange.map(dayOf)).size,
        entriesWithWeather: withWeather,
        moodCounts,
        weatherCounts: Object.fromEntries(topWeather),
        moodByWeather: topWeather.map(([weather]) => byWeather.get(weather)),
        averageTemperatureByMood,
      },
      excerpts,
    },
  };
}

// --- Day plan ----------------------------------------------------------------

export function isForecastFresh(fetchedAt, now = Date.now()) {
  return (
    typeof fetchedAt === 'number' && now - fetchedAt >= 0 && now - fetchedAt <= FORECAST_FRESH_MS
  );
}

// The forecast numbers for one day the app already loaded, and a preference.
export function dayPlanRequest(forecastDay, preference, language = 'en') {
  return {
    forecast: {
      date: forecastDay.date,
      weatherType: safeLabel(forecastDay.weatherType) || 'Unknown',
      max: forecastDay.max,
      min: forecastDay.min,
      precipitation: Math.round((forecastDay.precipitation || 0) * 10) / 10,
      uv: typeof forecastDay.uv === 'number' ? Math.round(forecastDay.uv * 10) / 10 : null,
    },
    preference: PLAN_PREFERENCES.includes(preference) ? preference : 'none',
    language,
  };
}

// --- Writing prompt ----------------------------------------------------------

// The opening lines of the latest few entries, newest first.
export function recentForPrompt(entries, count = PROMPT_RECENT_ENTRIES) {
  return entries
    .filter((e) => dayOf(e) && stripMarkdown(e.content || '').trim())
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, count)
    .map((e) => ({ date: dayOf(e), text: oneLine(e.content, PROMPT_RECENT_CHARS) }));
}

// Today's date and the weather type, and (only if the person allowed it)
// the opening lines of their last few entries. Works with neither.
export function writingPromptRequest({
  entries,
  useRecent,
  weatherType,
  language = 'en',
  now = new Date(),
}) {
  return {
    date: localDay(now),
    weather: safeLabel(weatherType),
    recent: useRecent ? recentForPrompt(entries) : [],
    language,
  };
}

// --- Errors ------------------------------------------------------------------

// Which translated message to show for a failed request. Provider details
// are never shown; the server sends only a status and a safe sentence.
export function aiErrorKey(error) {
  if (error?.code === 'network') return 'ai.error.network';
  switch (error?.status) {
    case 404:
      return 'ai.error.syncMissing';
    case 401:
    case 403:
      return 'ai.error.auth';
    case 503:
      return 'ai.error.notConfigured';
    case 429:
      return 'ai.error.limit';
    case 504:
      return 'ai.error.timeout';
    case 422:
      return 'ai.error.blocked';
    case 400:
    case 413:
      return 'ai.error.request';
    default:
      return 'ai.error.provider';
  }
}
