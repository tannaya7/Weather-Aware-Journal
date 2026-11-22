import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AI_TASKS,
  EXCERPT_CHARS,
  FORECAST_FRESH_MS,
  MAX_EXCERPTS,
  MIN_REVIEW_ENTRIES,
  aiErrorKey,
  buildReviewRequest,
  checkRange,
  dayPlanRequest,
  entryForAi,
  isForecastFresh,
  lastDays,
  localDay,
  recentForPrompt,
  writingPromptRequest,
} from '../../src/lib/aiTasks.js';

const day = (n) => localDay(new Date(2026, 9, n)); // October n, 2026
const at = (n) => `${day(n)}T10:00`;

describe('task names', () => {
  it('are the four stable names, one per task', () => {
    expect(AI_TASKS).toEqual({
      organization: 'entry_organization',
      dayPlan: 'weather_day_plan',
      writingPrompt: 'writing_prompt',
      periodReview: 'journal_period_review',
    });
  });
});

describe('what leaves the device for one entry', () => {
  it('is the words, date, mood and weather, and nothing else', () => {
    const sent = entryForAi({
      id: 1,
      content: 'A **quiet** walk',
      date: '2026-10-05T09:30',
      mood: 'Peaceful',
      weatherType: 'Rain',
      temperature: '18°C',
      tags: ['secret-tag'],
      locationName: 'Secret Street',
      latitude: 1,
      longitude: 2,
      images: ['data:image/png;base64,AAA'],
      audio: [{ src: 'data:audio/webm;base64,BBB' }],
      habits: { water: 3 },
    });
    expect(sent).toEqual({ date: '2026-10-05', mood: 'Peaceful', weather: 'Rain, 18°C', text: 'A quiet walk' });
    const json = JSON.stringify(sent);
    for (const secret of ['secret-tag', 'Secret Street', 'data:image', 'data:audio', 'water']) expect(json).not.toContain(secret);
  });

  it('copes with no mood, a mood that is not one of the six, and no weather', () => {
    expect(entryForAi({ content: 'x', date: '2026-10-05T09:30', mood: 'Ecstatic' })).toMatchObject({ mood: '', weather: '' });
    expect(entryForAi({ content: 'x' })).toMatchObject({ date: '', mood: '', weather: '', text: 'x' });
  });
});

describe('period review: counts and short excerpts, for the chosen dates only', () => {
  const entries = [
    { content: 'SECRET words one', date: at(1), mood: 'Sad', weatherType: 'Rain', temperature: '12°C' },
    { content: 'SECRET words two', date: at(2), mood: 'Sad', weatherType: 'Rain', temperature: '14°C' },
    { content: 'SECRET words three', date: at(3), mood: 'Happy', weatherType: 'Clear', temperature: '22°C' },
    { content: 'SECRET words four', date: at(3), mood: 'Happy' },
    { content: 'outside the range', date: at(25), mood: 'Angry', weatherType: 'Snow' },
    { content: 'no mood', date: at(4), weatherType: 'Clear' },
  ];
  const built = buildReviewRequest(entries, { from: day(1), to: day(10) }, 'es');

  it('counts only entries inside the dates (inclusive), and says how many', () => {
    expect(built.sampleSize).toBe(5);
    expect(built.request.range).toEqual({ from: day(1), to: day(10) });
    expect(built.request.language).toBe('es');
    expect(built.request.summary).toMatchObject({ sampleSize: 5, daysWithEntries: 4, entriesWithWeather: 4 });
    expect(JSON.stringify(built.request)).not.toContain('outside the range');
  });

  it('counts moods, weather and mood by weather without inventing any', () => {
    const s = built.request.summary;
    expect(s.moodCounts).toEqual({ Sad: 2, Happy: 2 });
    expect(s.weatherCounts).toEqual({ Rain: 2, Clear: 2 });
    expect(s.moodByWeather).toEqual(
      expect.arrayContaining([
        { weather: 'Rain', count: 2, moods: { Sad: 2 } },
        { weather: 'Clear', count: 2, moods: { Happy: 1 } },
      ]),
    );
    expect(s.averageTemperatureByMood).toEqual({ Sad: 13, Happy: 22 });
  });

  it('sends a short excerpt of each entry, and says how many', () => {
    expect(built.excerptCount).toBe(5);
    expect(built.request.excerpts.map((e) => e.text)).toContain('SECRET words one');
    expect(built.request.excerpts[0]).toEqual({ date: day(1), mood: 'Sad', weather: 'Rain', text: 'SECRET words one' });
  });

  it('bounds the number and length of excerpts, spread across the period', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ content: `Entry ${i} ${'z'.repeat(1000)}`, date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T10:00` }));
    const big = buildReviewRequest(many, { from: '2026-10-01', to: '2026-10-28' });
    expect(big.sampleSize).toBe(60);
    expect(big.excerptCount).toBe(MAX_EXCERPTS);
    expect(big.request.excerpts).toHaveLength(MAX_EXCERPTS);
    for (const e of big.request.excerpts) expect(e.text.length).toBeLessThanOrEqual(EXCERPT_CHARS);
  });

  it('works with no moods, no weather, and an empty period', () => {
    const bare = buildReviewRequest([{ content: 'x', date: at(1) }], { from: day(1), to: day(2) });
    expect(bare.request.summary).toMatchObject({ sampleSize: 1, entriesWithWeather: 0, moodCounts: {}, weatherCounts: {}, moodByWeather: [] });
    expect(buildReviewRequest([], { from: day(1), to: day(2) })).toMatchObject({ sampleSize: 0, excerptCount: 0 });
  });

  it('skips weather labels the server would refuse', () => {
    const odd = buildReviewRequest([{ content: 'x', date: at(1), mood: 'Sad', weatherType: '<script>' }], { from: day(1), to: day(2) });
    expect(odd.request.summary.weatherCounts).toEqual({});
    expect(odd.request.summary.entriesWithWeather).toBe(0);
  });

  it('needs at least 3 entries', () => {
    expect(MIN_REVIEW_ENTRIES).toBe(3);
  });
});

describe('periods', () => {
  it('the last 7 days include today and the 6 before it', () => {
    expect(lastDays(7, new Date(2026, 10, 21))).toEqual({ from: '2026-11-15', to: '2026-11-21' });
  });

  it('accepts a real, ordered period of at most 92 days that is not in the future', () => {
    const now = new Date(2026, 10, 21);
    expect(checkRange({ from: '2026-11-01', to: '2026-11-21' }, now)).toBe(true);
    expect(checkRange({ from: '2026-08-22', to: '2026-11-21' }, now)).toBe(true); // exactly 92 days
    expect(checkRange({ from: '2026-08-21', to: '2026-11-21' }, now)).toBe(false); // 93 days
  });

  it('refuses a backwards, future, over-long, or incomplete period', () => {
    const now = new Date(2026, 10, 21);
    expect(checkRange({ from: '2026-11-21', to: '2026-11-01' }, now)).toBe(false);
    expect(checkRange({ from: '2026-11-20', to: '2026-11-25' }, now)).toBe(false);
    expect(checkRange({ from: '2026-01-01', to: '2026-11-21' }, now)).toBe(false);
    expect(checkRange({ from: '', to: '2026-11-21' }, now)).toBe(false);
    expect(checkRange({ from: 'x', to: 'y' }, now)).toBe(false);
  });
});

describe('day plan: only forecast numbers', () => {
  const forecastDay = { date: '2026-11-22', code: 61, weatherType: 'Rain', icon: '🌧️', max: 11, min: 6, precipitation: 4.26, uv: 1.54 };

  it('sends the day’s numbers and a preference, and nothing about the journal', () => {
    expect(dayPlanRequest(forecastDay, 'quiet', 'es')).toEqual({
      forecast: { date: '2026-11-22', weatherType: 'Rain', max: 11, min: 6, precipitation: 4.3, uv: 1.5 },
      preference: 'quiet',
      language: 'es',
    });
  });

  it('copes with no UV figure, an unknown preference, and an odd weather label', () => {
    const plan = dayPlanRequest({ ...forecastDay, uv: null, weatherType: '<b>' }, 'sleep', 'en');
    expect(plan.forecast.uv).toBeNull();
    expect(plan.forecast.weatherType).toBe('Unknown');
    expect(plan.preference).toBe('none');
  });

  it('treats a forecast as fresh for a few hours only', () => {
    const now = 1_000_000_000_000;
    expect(isForecastFresh(now - 1000, now)).toBe(true);
    expect(isForecastFresh(now - FORECAST_FRESH_MS - 1, now)).toBe(false);
    expect(isForecastFresh(undefined, now)).toBe(false);
    expect(isForecastFresh(now + 5000, now)).toBe(false);
  });
});

describe('writing prompt: context only on request', () => {
  const entries = [
    { content: 'Oldest entry', date: at(1) },
    { content: 'Second **entry**', date: at(2) },
    { content: 'Third entry', date: at(3) },
    { content: `Newest ${'q'.repeat(500)}`, date: at(4) },
  ];

  it('sends just the date and weather type unless the person allowed more', () => {
    const request = writingPromptRequest({ entries, useRecent: false, weatherType: 'Rain', language: 'hi', now: new Date(2026, 10, 22) });
    expect(request).toEqual({ date: '2026-11-22', weather: 'Rain', recent: [], language: 'hi' });
    expect(JSON.stringify(request)).not.toContain('entry');
  });

  it('with permission, sends the opening lines of the last three entries, newest first and short', () => {
    const request = writingPromptRequest({ entries, useRecent: true, weatherType: '', now: new Date(2026, 10, 22) });
    expect(request.recent.map((r) => r.date)).toEqual([day(4), day(3), day(2)]);
    expect(request.recent[0].text.length).toBeLessThanOrEqual(240);
    expect(request.recent[2].text).toBe('Second entry');
    expect(JSON.stringify(request)).not.toContain('Oldest');
  });

  it('works with no entries and no weather', () => {
    expect(writingPromptRequest({ entries: [], useRecent: true, weatherType: undefined, now: new Date(2026, 10, 22) })).toMatchObject({
      date: '2026-11-22',
      weather: '',
      recent: [],
    });
    expect(recentForPrompt([])).toEqual([]);
  });
});

describe('error messages', () => {
  it('maps each failure to its own message, and never to provider text', () => {
    expect(aiErrorKey({ code: 'network' })).toBe('ai.error.network');
    expect(aiErrorKey({ status: 404 })).toBe('ai.error.syncMissing');
    expect(aiErrorKey({ status: 403 })).toBe('ai.error.auth');
    expect(aiErrorKey({ status: 503 })).toBe('ai.error.notConfigured');
    expect(aiErrorKey({ status: 429 })).toBe('ai.error.limit');
    expect(aiErrorKey({ status: 504 })).toBe('ai.error.timeout');
    expect(aiErrorKey({ status: 422 })).toBe('ai.error.blocked');
    expect(aiErrorKey({ status: 413 })).toBe('ai.error.request');
    expect(aiErrorKey({ status: 502 })).toBe('ai.error.provider');
    expect(aiErrorKey(new Error('anything'))).toBe('ai.error.provider');
  });
});

// The Gemini key belongs to the server only.
describe('the Gemini key stays out of the app', () => {
  function files(dir) {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it('nothing in src/ names the key, the key header, or the Gemini address', () => {
    const offenders = files('src')
      .filter((f) => /\.(js|jsx|css|html)$/.test(f))
      .filter((f) => /GEMINI_API_KEY|x-goog-api-key|generativelanguage|VITE_GEMINI/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('index.html and the build config set no client-side Gemini variable', () => {
    for (const f of ['index.html', 'vite.config.js']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/GEMINI/i);
    }
  });

  it('wrangler.toml holds no key value (secrets are set with `wrangler secret put`)', () => {
    expect(readFileSync('worker/wrangler.toml', 'utf8')).not.toMatch(/^\s*GEMINI_API_KEY\s*=/m);
  });
});
