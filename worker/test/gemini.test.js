// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handle } from '../src/index.js';
import { DEFAULT_MODEL, MAX_EXCERPTS, MAX_EXCERPT_CHARS, PER_JOURNAL_DAILY } from '../src/gemini.js';
import { SEALED, T0, VAULT, at, makeEnv, req } from './helpers.js';

const KEY = 'test-gemini-key-do-not-leak';
const SECRET_TEXT = 'Ananya told me about the secret garden';

async function syncedEnv(extra = {}) {
  const env = makeEnv({ GEMINI_API_KEY: KEY, ...extra });
  await handle(req('PUT', `/v1/vaults/${VAULT}/journal`, { body: { baseVersion: 0, data: SEALED } }), env, at(0));
  return env;
}

const geminiReply = (text, extra = {}) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], ...extra });
const asJson = (value) => JSON.stringify(value);

function fakeFetch(body, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

// retryDelayMs: 0 so the one retry after a temporary Gemini error does not slow the tests.
const deps = (fetchImpl, extra = {}) => ({ fetch: fetchImpl, now: () => T0 + 1, retryDelayMs: 0, ...extra });
const post = (task, body, ctx, opts) => handle(req('POST', `/v1/vaults/${VAULT}/ai/${task}`, { body, ...opts }), ctx.env, ctx.deps);

async function setup(replyValue, extra = {}) {
  const env = await syncedEnv(extra);
  const text = typeof replyValue === 'string' ? replyValue : asJson(replyValue);
  return { env, deps: deps(fakeFetch(geminiReply(text))) };
}

const sentBody = (ctx, n = 0) => JSON.parse(ctx.deps.fetch.mock.calls[n][1].body);
const systemOf = (ctx, n = 0) => sentBody(ctx, n).systemInstruction.parts[0].text;
const userOf = (ctx, n = 0) => sentBody(ctx, n).contents[0].parts[0].text;

// --- sample requests and replies, one per task ------------------------------

const ENTRY = { date: '2026-10-05', mood: 'Peaceful', weather: 'Rain, 18°C', text: SECRET_TEXT, ignoredField: 'nope' };
const FORECAST = { date: '2026-11-22', weatherType: 'Light rain', max: 11, min: 6, precipitation: 4.2, uv: 1.5 };
const REVIEW = {
  range: { from: '2026-11-01', to: '2026-11-21' },
  summary: {
    sampleSize: 12,
    daysWithEntries: 10,
    entriesWithWeather: 9,
    moodCounts: { Happy: 5, Sad: 3, Peaceful: 2 },
    weatherCounts: { Rain: 4, Clear: 5 },
    moodByWeather: [
      { weather: 'Rain', count: 4, moods: { Sad: 2, Happy: 1 } },
      { weather: 'Clear', count: 5, moods: { Happy: 4 } },
    ],
    averageTemperatureByMood: { Happy: 15.2, Sad: 9.1 },
  },
  excerpts: [
    { date: '2026-11-02', mood: 'Happy', weather: 'Clear', text: 'Long walk by the canal' },
    { date: '2026-11-09', mood: 'Sad', weather: 'Rain', text: 'Missed the bus and the call' },
  ],
};
const ORGANIZATION_REPLY = { summary: 'A quiet evening after rain.', tags: ['rain', 'garden'], mood: 'Peaceful' };
const PLAN_REPLY = { suggestions: ['Take a short walk between showers.', 'Keep the afternoon free for reading.'], question: 'What slowed you down today?' };
const PROMPT_REPLY = { prompt: 'What is one small thing you noticed today that you usually walk past?' };
const REVIEW_REPLY = {
  insufficient: false,
  themes: ['Walks by the canal', 'Missed connections'],
  notableMoments: ['Nov 9: missed the bus and a call'],
  interpretation: 'One possibility is that busy days left less room for calm.',
  question: 'What would make next week feel less rushed?',
};

describe('four separate tasks, each its own Gemini request', () => {
  it('every task makes exactly one request with its own instructions and its own reply shape', async () => {
    const env = await syncedEnv();
    const cases = [
      ['entry_organization', { entry: ENTRY }, ORGANIZATION_REPLY, /organize one journal entry/, 'summary'],
      ['weather_day_plan', { forecast: FORECAST, preference: 'quiet' }, PLAN_REPLY, /plan a day around the weather forecast/, 'suggestions'],
      ['writing_prompt', { date: '2026-11-22', weather: 'Rain' }, PROMPT_REPLY, /journal writing prompt/, 'prompt'],
      ['journal_period_review', REVIEW, REVIEW_REPLY, /review a period of their own journal/, 'themes'],
    ];
    const systems = new Set();
    for (const [task, body, replyValue, instruction, field] of cases) {
      const ctx = { env, deps: deps(fakeFetch(geminiReply(asJson(replyValue)))) };
      const res = await post(task, body, ctx);
      expect(res.status).toBe(200);
      expect(ctx.deps.fetch).toHaveBeenCalledTimes(1);
      expect(systemOf(ctx)).toMatch(instruction);
      expect((await res.json())[field]).toBeDefined();
      systems.add(systemOf(ctx));
    }
    expect(systems.size).toBe(4);
  });

  it('every task sends the key only in a header, asks for JSON, and has a bounded reply length', async () => {
    const env = await syncedEnv();
    for (const [task, body, replyValue] of [
      ['entry_organization', { entry: ENTRY }, ORGANIZATION_REPLY],
      ['weather_day_plan', { forecast: FORECAST }, PLAN_REPLY],
      ['writing_prompt', { date: '2026-11-22' }, PROMPT_REPLY],
      ['journal_period_review', REVIEW, REVIEW_REPLY],
    ]) {
      const ctx = { env, deps: deps(fakeFetch(geminiReply(asJson(replyValue)))) };
      await post(task, body, ctx);
      const [url, init] = ctx.deps.fetch.mock.calls[0];
      expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
      expect(init.headers['x-goog-api-key']).toBe(KEY);
      expect(init.body).not.toContain(KEY);
      expect(url).not.toContain(KEY);
      const config = sentBody(ctx).generationConfig;
      expect(config.responseMimeType).toBe('application/json');
      expect(config.maxOutputTokens).toBeLessThanOrEqual(1024);
    }
  });

  it('every prompt keeps the weather from being blamed for a mood', async () => {
    const env = await syncedEnv();
    for (const [task, body, replyValue] of [
      ['entry_organization', { entry: ENTRY }, ORGANIZATION_REPLY],
      ['weather_day_plan', { forecast: FORECAST }, PLAN_REPLY],
      ['writing_prompt', { date: '2026-11-22' }, PROMPT_REPLY],
      ['journal_period_review', REVIEW, REVIEW_REPLY],
    ]) {
      const ctx = { env, deps: deps(fakeFetch(geminiReply(asJson(replyValue)))) };
      await post(task, body, ctx);
      expect(systemOf(ctx)).toMatch(/never say it caused, explains, or determines a mood or feeling/);
    }
  });

  it('only POST is answered on these routes', async () => {
    const env = await syncedEnv();
    expect((await handle(req('GET', `/v1/vaults/${VAULT}/ai/writing_prompt`), env)).status).toBe(405);
    expect((await handle(req('POST', `/v1/vaults/${VAULT}/ai/no_such_task`, { body: {} }), env)).status).toBe(404);
  });
});

describe('entry_organization', () => {
  it('returns a summary, clean new tags, and a mood the app has', async () => {
    const ctx = await setup({ summary: 'About a quiet evening.', tags: ['Rain', 'garden', 'garden', 'already', 'a, b', 'x'.repeat(40), '#friends', 'one', 'two', 'three'], mood: 'Peaceful' });
    const res = await post('entry_organization', { entry: ENTRY, existingTags: ['Already'] }, ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.summary).toBe('About a quiet evening.');
    expect(body.tags).toEqual(['rain', 'garden', 'friends', 'one', 'two']);
    expect(body.mood).toBe('Peaceful');
    expect(userOf(ctx)).toContain(SECRET_TEXT);
    expect(userOf(ctx)).toContain('already');
    expect(ctx.deps.fetch.mock.calls[0][1].body).not.toContain('ignoredField');
  });

  it('drops a mood that is not one of the six, and allows no mood at all', async () => {
    const bad = await setup({ summary: 'Something.', tags: [], mood: 'Ecstatic' });
    expect((await (await post('entry_organization', { entry: ENTRY }, bad)).json()).mood).toBeNull();
    const none = await setup({ summary: 'Something.', tags: ['a'], mood: null });
    expect((await (await post('entry_organization', { entry: ENTRY }, none)).json()).mood).toBeNull();
  });

  it('works when the entry has no mood or weather', async () => {
    const ctx = await setup(ORGANIZATION_REPLY);
    const res = await post('entry_organization', { entry: { text: 'Just words.' } }, ctx);
    expect(res.status).toBe(200);
    expect(userOf(ctx)).not.toMatch(/Mood chosen|Weather recorded/);
  });

  it('needs a summary; without one the reply is unusable', async () => {
    const ctx = await setup({ summary: '', tags: ['a'], mood: 'Happy' });
    const res = await post('entry_organization', { entry: ENTRY }, ctx);
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('malformed');
  });

  it('refuses an entry with no text, and cuts very long text before sending', async () => {
    const ctx = await setup(ORGANIZATION_REPLY);
    expect((await post('entry_organization', { entry: { text: '   ' } }, ctx)).status).toBe(400);
    expect(ctx.deps.fetch).not.toHaveBeenCalled();
    await post('entry_organization', { entry: { text: 'b'.repeat(30_000) } }, ctx);
    expect(ctx.deps.fetch.mock.calls[0][1].body.length).toBeLessThan(9000);
  });
});

describe('weather_day_plan', () => {
  it('turns the forecast numbers into ideas and an optional question, without any journal text', async () => {
    const ctx = await setup(PLAN_REPLY);
    const res = await post('weather_day_plan', { forecast: FORECAST, preference: 'creative', entry: ENTRY }, ctx);
    const body = await res.json();
    expect(body.suggestions).toHaveLength(2);
    expect(body.question).toBe('What slowed you down today?');
    expect(userOf(ctx)).toMatch(/Forecast for 2026-11-22: Light rain, high 11°C, low 6°C, precipitation 4.2 mm, UV index up to 1.5/);
    expect(userOf(ctx)).toContain('something creative');
    expect(ctx.deps.fetch.mock.calls[0][1].body).not.toContain(SECRET_TEXT);
  });

  it('works with no UV figure and no preference, and with no question in the reply', async () => {
    const ctx = await setup({ suggestions: ['One idea.', 'Another idea.'] });
    const res = await post('weather_day_plan', { forecast: { ...FORECAST, uv: null } }, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).question).toBe('');
    expect(userOf(ctx)).not.toContain('UV');
    expect(userOf(ctx)).toContain('no particular preference');
  });

  it('will not invent a forecast: missing or odd numbers are refused before Gemini', async () => {
    const ctx = await setup(PLAN_REPLY);
    expect((await post('weather_day_plan', {}, ctx)).status).toBe(400);
    expect((await post('weather_day_plan', { forecast: { ...FORECAST, max: 500 } }, ctx)).status).toBe(400);
    expect((await post('weather_day_plan', { forecast: { ...FORECAST, date: 'tomorrow' } }, ctx)).status).toBe(400);
    expect((await post('weather_day_plan', { forecast: { ...FORECAST, weatherType: '<script>' } }, ctx)).status).toBe(400);
    expect(ctx.deps.fetch).not.toHaveBeenCalled();
  });

  it('an unknown preference is treated as none', async () => {
    const ctx = await setup(PLAN_REPLY);
    await post('weather_day_plan', { forecast: FORECAST, preference: 'sleep all day' }, ctx);
    expect(userOf(ctx)).toContain('no particular preference');
  });

  it('a plan with fewer than two ideas is unusable', async () => {
    const ctx = await setup({ suggestions: ['Only one.'], question: '' });
    expect((await post('weather_day_plan', { forecast: FORECAST }, ctx)).status).toBe(502);
  });
});

describe('writing_prompt', () => {
  it('works with no weather and no earlier entries', async () => {
    const ctx = await setup(PROMPT_REPLY);
    const res = await post('writing_prompt', { date: '2026-11-22' }, ctx);
    expect((await res.json()).prompt).toMatch(/small thing you noticed/);
    expect(userOf(ctx)).toBe('Today is 2026-11-22.');
  });

  it('uses the weather, and the opening lines of at most three recent entries when sent', async () => {
    const ctx = await setup(PROMPT_REPLY);
    const recent = [1, 2, 3, 4, 5].map((n) => ({ date: `2026-11-0${n}`, text: `Opening line ${n} ${'x'.repeat(500)}` }));
    await post('writing_prompt', { date: '2026-11-22', weather: 'Light rain', recent }, ctx);
    const user = userOf(ctx);
    expect(user).toContain('The weather today: Light rain.');
    expect(user).toContain('Opening line 3');
    expect(user).not.toContain('Opening line 4');
    expect(user.length).toBeLessThan(1500);
  });

  it('keeps entry text out of the request unless it was sent', async () => {
    const ctx = await setup(PROMPT_REPLY);
    await post('writing_prompt', { date: '2026-11-22', weather: 'Rain', entry: ENTRY }, ctx);
    expect(ctx.deps.fetch.mock.calls[0][1].body).not.toContain(SECRET_TEXT);
  });

  it('one prompt only: an empty or multi-line reply is unusable', async () => {
    const multi = await setup({ prompt: 'First idea\nSecond idea' });
    expect((await post('writing_prompt', { date: '2026-11-22' }, multi)).status).toBe(502);
    const empty = await setup({ prompt: '   ' });
    expect((await post('writing_prompt', { date: '2026-11-22' }, empty)).status).toBe(502);
  });

  it('needs a real date', async () => {
    const ctx = await setup(PROMPT_REPLY);
    expect((await post('writing_prompt', { date: 'soon' }, ctx)).status).toBe(400);
    expect(ctx.deps.fetch).not.toHaveBeenCalled();
  });
});

describe('journal_period_review', () => {
  it('returns observations, an interpretation, and a question, separately', async () => {
    const ctx = await setup(REVIEW_REPLY);
    const res = await post('journal_period_review', REVIEW, ctx);
    const body = await res.json();
    expect(body).toMatchObject({
      insufficient: false,
      themes: ['Walks by the canal', 'Missed connections'],
      notableMoments: ['Nov 9: missed the bus and a call'],
      question: 'What would make next week feel less rushed?',
    });
    expect(body.interpretation).toMatch(/One possibility/);
    expect(systemOf(ctx)).toMatch(/Themes and moments are observations/);
    expect(systemOf(ctx)).toMatch(/Never predict the future/);
    expect(userOf(ctx)).toContain('2026-11-01 to 2026-11-21');
    expect(userOf(ctx)).toContain('Long walk by the canal');
    expect(userOf(ctx)).toContain('Excerpts (2 of 12 entries)');
  });

  it('sends a bounded number of short excerpts', async () => {
    const ctx = await setup(REVIEW_REPLY);
    const many = Array.from({ length: 40 }, (_, i) => ({ date: '2026-11-05', text: `Entry ${i} ${'y'.repeat(1000)}` }));
    await post('journal_period_review', { ...REVIEW, excerpts: many }, ctx);
    const user = userOf(ctx);
    expect((user.match(/<entry>/g) || []).length).toBe(MAX_EXCERPTS);
    expect(user).not.toContain('y'.repeat(MAX_EXCERPT_CHARS + 1));
  });

  it('works with no moods, no weather, and no excerpts at all', async () => {
    const ctx = await setup(REVIEW_REPLY);
    const bare = {
      range: REVIEW.range,
      summary: { sampleSize: 4, daysWithEntries: 4, entriesWithWeather: 0, moodCounts: {}, weatherCounts: {}, moodByWeather: [], averageTemperatureByMood: {} },
    };
    const res = await post('journal_period_review', bare, ctx);
    expect(res.status).toBe(200);
    expect(userOf(ctx)).toContain('0 have recorded weather');
  });

  it('says "not enough" when the model says so', async () => {
    const ctx = await setup({ insufficient: true });
    const body = await (await post('journal_period_review', REVIEW, ctx)).json();
    expect(body.insufficient).toBe(true);
    expect(body.themes).toBeUndefined();
  });

  it('refuses a period that is too long, too thin, or malformed, before calling Gemini', async () => {
    const ctx = await setup(REVIEW_REPLY);
    const tooLong = { ...REVIEW, range: { from: '2026-01-01', to: '2026-11-21' } };
    expect((await post('journal_period_review', tooLong, ctx)).status).toBe(400);
    const backwards = { ...REVIEW, range: { from: '2026-11-21', to: '2026-11-01' } };
    expect((await post('journal_period_review', backwards, ctx)).status).toBe(400);
    const thin = { ...REVIEW, summary: { ...REVIEW.summary, sampleSize: 2 } };
    expect((await post('journal_period_review', thin, ctx)).status).toBe(400);
    const badMood = { ...REVIEW, summary: { ...REVIEW.summary, moodCounts: { Ecstatic: 3 } } };
    expect((await post('journal_period_review', badMood, ctx)).status).toBe(400);
    const badLabel = { ...REVIEW, summary: { ...REVIEW.summary, weatherCounts: { '<script>': 2 } } };
    expect((await post('journal_period_review', badLabel, ctx)).status).toBe(400);
    expect(ctx.deps.fetch).not.toHaveBeenCalled();
  });

  it('a review with no themes is unusable, never shown half-empty', async () => {
    const ctx = await setup({ insufficient: false, themes: [], notableMoments: [], interpretation: 'x', question: '' });
    expect((await post('journal_period_review', REVIEW, ctx)).status).toBe(502);
  });
});

describe('model and language', () => {
  it('asks for the reply in the app language, and ignores thinking parts', async () => {
    const env = await syncedEnv();
    const fetchImpl = fakeFetch({
      candidates: [{ content: { parts: [{ text: 'hidden thought', thought: true }, { text: asJson(PROMPT_REPLY) }] }, finishReason: 'STOP' }],
    });
    const ctx = { env, deps: deps(fetchImpl) };
    const res = await post('writing_prompt', { date: '2026-11-22', language: 'hi' }, ctx);
    expect((await res.json()).prompt).toBe(PROMPT_REPLY.prompt);
    expect(systemOf(ctx)).toContain('Hindi');
  });

  it('uses GEMINI_MODEL, and refuses a malformed model name', async () => {
    const ok = await setup(PROMPT_REPLY, { GEMINI_MODEL: 'gemini-3.8-flash' });
    await post('writing_prompt', { date: '2026-11-22' }, ok);
    expect(ok.deps.fetch.mock.calls[0][0]).toContain('/models/gemini-3.8-flash:generateContent');
    const bad = await setup(PROMPT_REPLY, { GEMINI_MODEL: '../evil?x=' });
    expect((await post('writing_prompt', { date: '2026-11-22' }, bad)).status).toBe(503);
    expect(bad.deps.fetch).not.toHaveBeenCalled();
  });

  it('counts down the requests left today', async () => {
    const ctx = await setup(PROMPT_REPLY);
    const run = (ms) => handle(req('POST', `/v1/vaults/${VAULT}/ai/writing_prompt`, { body: { date: '2026-11-22' } }), ctx.env, { ...ctx.deps, now: () => T0 + ms });
    expect((await (await run(1)).json()).remainingToday).toBe(PER_JOURNAL_DAILY - 1);
    expect((await (await run(2)).json()).remainingToday).toBe(PER_JOURNAL_DAILY - 2);
  });
});

describe('failures are failures', () => {
  async function failureCase(fetchImpl, extra = {}) {
    const env = await syncedEnv(extra.env);
    const res = await post('writing_prompt', { date: '2026-11-22' }, { env, deps: deps(fetchImpl, extra.deps) });
    return { res, body: await res.json() };
  }

  it('no key: says it is not set up, calls nothing, counts nothing', async () => {
    const env = await syncedEnv({ GEMINI_API_KEY: undefined });
    const d = deps(fakeFetch(geminiReply('x')));
    const res = await post('writing_prompt', { date: '2026-11-22' }, { env, deps: d });
    expect(res.status).toBe(503);
    expect(d.fetch).not.toHaveBeenCalled();
    expect([...env.JOURNAL.store.keys()].filter((k) => k.includes('gemini') || k.includes(':ai:'))).toEqual([]);
  });

  it('provider quota (429): a clear limit message, without the provider’s details', async () => {
    const { res, body } = await failureCase(fakeFetch({ error: { message: 'Quota exceeded for project 123', status: 'RESOURCE_EXHAUSTED' } }, 429));
    expect(res.status).toBe(429);
    expect(body.code).toBe('provider-limit');
    expect(JSON.stringify(body)).not.toContain('123');
  });

  it('bad key (403): the person sees "not set up", never the key or the provider message', async () => {
    const { res, body } = await failureCase(fakeFetch({ error: { message: 'API key not valid: ' + KEY } }, 403));
    expect(res.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain(KEY);
  });

  it('server error and network failure are retryable failures', async () => {
    expect((await failureCase(fakeFetch({}, 500))).res.status).toBe(502);
    expect((await failureCase(vi.fn(async () => { throw new TypeError('fetch failed'); }))).res.status).toBe(502);
  });

  it('timeout: stops waiting and says so', async () => {
    const slow = vi.fn((url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    const { res, body } = await failureCase(slow, { deps: { timeoutMs: 20 } });
    expect(res.status).toBe(504);
    expect(body.code).toBe('timeout');
  });

  it('a blocked prompt or reply is a failure, not an empty success', async () => {
    expect((await failureCase(fakeFetch({ promptFeedback: { blockReason: 'SAFETY' } }))).res.status).toBe(422);
    expect((await failureCase(fakeFetch({ candidates: [{ finishReason: 'SAFETY' }] }))).res.status).toBe(422);
  });

  it('a reply cut off by the length limit, an empty reply, and invalid JSON are failures', async () => {
    expect((await failureCase(fakeFetch({ candidates: [{ content: { parts: [{ text: '{"prompt": "Half a thou' }] }, finishReason: 'MAX_TOKENS' }] }))).res.status).toBe(502);
    expect((await failureCase(fakeFetch({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }))).res.status).toBe(502);
    const notJson = await failureCase(fakeFetch(geminiReply('Here is a prompt: what did you notice today?')));
    expect(notJson.res.status).toBe(502);
    expect(notJson.body.code).toBe('malformed');
  });

  it('nothing from the entry or the reply is written to the log', async () => {
    const spies = ['log', 'info', 'warn', 'error'].map((name) => vi.spyOn(console, name).mockImplementation(() => {}));
    try {
      const env = await syncedEnv();
      await post('entry_organization', { entry: ENTRY }, { env, deps: deps(fakeFetch({ error: { message: 'boom ' + SECRET_TEXT } }, 500)) });
      await post('entry_organization', { entry: ENTRY }, { env, deps: deps(fakeFetch(geminiReply(asJson({ summary: 'About the secret garden.', tags: [], mood: null })))) });
      const logged = spies.flatMap((s) => s.mock.calls).join(' ');
      expect(logged).not.toContain('secret garden');
      expect(logged).not.toContain(KEY);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

// Answers in order, then keeps repeating the last one.
function fetchSequence(...answers) {
  const queue = [...answers];
  return vi.fn(async () => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
}

describe('a temporary Gemini server error is tried once more', () => {
  const OK = { body: geminiReply(asJson(PROMPT_REPLY)) };
  const run = async (fetchImpl, extra = {}) => {
    const env = await syncedEnv();
    const res = await post('writing_prompt', { date: '2026-11-22' }, { env, deps: deps(fetchImpl, extra) });
    return { res, body: await res.json() };
  };

  it('a 503 ("high demand") followed by an answer gives the person the answer', async () => {
    const fetchImpl = fetchSequence({ status: 503, body: { error: { message: 'high demand' } } }, OK);
    const { res, body } = await run(fetchImpl);
    expect(res.status).toBe(200);
    expect(body.prompt).toBe(PROMPT_REPLY.prompt);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('the retry does not use up the daily limit', async () => {
    const { body } = await run(fetchSequence({ status: 500, body: {} }, OK));
    expect(body.remainingToday).toBe(PER_JOURNAL_DAILY - 1);
  });

  it('two failures in a row still end as a clear failure, after exactly two attempts', async () => {
    const fetchImpl = fetchSequence({ status: 503, body: {} });
    const { res, body } = await run(fetchImpl);
    expect(res.status).toBe(502);
    expect(body.code).toBe('provider');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('quota, a bad key, a blocked reply and a timeout are not retried', async () => {
    for (const fetchImpl of [
      fetchSequence({ status: 429, body: {} }),
      fetchSequence({ status: 403, body: {} }),
      fetchSequence({ status: 400, body: {} }),
      fetchSequence({ body: { promptFeedback: { blockReason: 'SAFETY' } } }),
    ]) {
      await run(fetchImpl);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
    const slow = vi.fn((url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
    const { res } = await run(slow, { timeoutMs: 20 });
    expect(res.status).toBe(504);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('an unusable reply is not retried either', async () => {
    const fetchImpl = fetchSequence({ body: geminiReply('not json at all') });
    const { res } = await run(fetchImpl);
    expect(res.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('access and limits', () => {
  it('needs a synced journal and the right token', async () => {
    const d = deps(fakeFetch(geminiReply('x')));
    expect((await post('writing_prompt', { date: '2026-11-22' }, { env: makeEnv({ GEMINI_API_KEY: KEY }), deps: d })).status).toBe(404);
    const env = await syncedEnv();
    const wrong = await handle(req('POST', `/v1/vaults/${VAULT}/ai/writing_prompt`, { body: { date: '2026-11-22' }, token: 'c'.repeat(64) }), env, d);
    expect(wrong.status).toBe(403);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('rejects an oversized request', async () => {
    const ctx = await setup(PROMPT_REPLY);
    expect((await post('entry_organization', { entry: { text: 'a'.repeat(70 * 1024) } }, ctx)).status).toBe(413);
    expect(ctx.deps.fetch).not.toHaveBeenCalled();
  });

  it('limits a short burst without calling Gemini for the extra ones', async () => {
    const ctx = await setup(PROMPT_REPLY);
    const run = (ms) => handle(req('POST', `/v1/vaults/${VAULT}/ai/writing_prompt`, { body: { date: '2026-11-22' } }), ctx.env, { ...ctx.deps, now: () => T0 + ms });
    for (let i = 0; i < 6; i++) expect((await run(i)).status).toBe(200);
    expect((await run(10)).status).toBe(429);
    expect(ctx.deps.fetch).toHaveBeenCalledTimes(6);
    expect((await run(61_000)).status).toBe(200);
  });

  it('caps each journal per day, across all four tasks', async () => {
    const ctx = await setup(PROMPT_REPLY);
    await ctx.env.JOURNAL.put(`vault:${VAULT}:gemini:${new Date(T0 + 1).toISOString().slice(0, 10)}`, String(PER_JOURNAL_DAILY));
    expect((await post('writing_prompt', { date: '2026-11-22' }, ctx)).status).toBe(429);
    expect((await post('journal_period_review', REVIEW, ctx)).status).toBe(429);
    expect(ctx.deps.fetch).not.toHaveBeenCalled();
  });

  it('caps the whole server per day, so strangers cannot spend the quota', async () => {
    const ctx = await setup(PROMPT_REPLY, { GEMINI_GLOBAL_DAILY: '2' });
    const run = (ms) => handle(req('POST', `/v1/vaults/${VAULT}/ai/writing_prompt`, { body: { date: '2026-11-22' } }), ctx.env, { ...ctx.deps, now: () => T0 + ms });
    expect((await run(1)).status).toBe(200);
    expect((await run(2)).status).toBe(200);
    const third = await run(3);
    expect(third.status).toBe(429);
    expect((await third.json()).error).toMatch(/everyone/);
    expect(ctx.deps.fetch).toHaveBeenCalledTimes(2);
  });
});
