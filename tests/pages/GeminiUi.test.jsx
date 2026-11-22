import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { EntryDetail } from '../../src/pages/EntryDetail.jsx';
import { EntryFormPage } from '../../src/pages/EntryFormPage.jsx';
import { Insights } from '../../src/pages/Insights.jsx';
import { Settings } from '../../src/pages/Settings.jsx';
import { loadEntries } from '../../src/lib/storage.js';
import { localDay } from '../../src/lib/aiTasks.js';
import { setServerUrl } from '../../src/lib/syncClient.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';
import { handle } from '../../worker/src/index.js';

// The real server code in memory, reached through a stubbed fetch. Its own
// calls to Gemini go to `gemini`, a fake, so the whole path from the button
// to the server to "Gemini" is exercised without any network. Weather
// requests go to `weather`, a fake too.
function startServer({ key = 'test-key', gemini, weather = vi.fn() } = {}) {
  const store = new Map();
  let clock = Date.now();
  const deps = { now: () => (clock += 2000), fetch: gemini };
  const env = {
    ALLOWED_ORIGINS: '',
    ...(key ? { GEMINI_API_KEY: key } : {}),
    JOURNAL: {
      get: async (k, type) => (store.has(k) ? (type === 'json' ? JSON.parse(store.get(k)) : store.get(k)) : null),
      put: async (k, v) => store.set(k, v),
      delete: async (k) => store.delete(k),
      list: async () => ({ keys: [], list_complete: true }),
    },
  };
  vi.stubGlobal('fetch', (url, init) => (String(url).includes('api.open-meteo.com') ? weather(url, init) : handle(new Request(url, init), env, deps)));
  return { weather };
}

const reply = (value) => ({ candidates: [{ content: { parts: [{ text: typeof value === 'string' ? value : JSON.stringify(value) }] }, finishReason: 'STOP' }] });

// A fake Gemini that answers after a moment, so a second click has time to
// arrive while the first request is still out.
function fakeGemini(...answers) {
  return vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 40));
    const next = answers.length > 1 ? answers.shift() : answers[0];
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
}

const sentUser = (gemini, n = 0) => JSON.parse(gemini.mock.calls[n][1].body).contents[0].parts[0].text;
const sentSystem = (gemini, n = 0) => JSON.parse(gemini.mock.calls[n][1].body).systemInstruction.parts[0].text;

function renderAt(path, language = 'en') {
  return renderWithJournal(
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/new" element={<EntryFormPage />} />
      <Route path="/entry/:id" element={<EntryDetail />} />
      <Route path="/insights" element={<Insights />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>,
    { initialEntries: [path], language },
  );
}

const recent = (n) => `${localDay(new Date(Date.now() - n * 86400000))}T10:00`;
const SECRET = 'Walked by the canal and thought about Ananya';

async function withSync(user) {
  const settings = await renderAt('/settings');
  await user.click(screen.getByRole('button', { name: 'Turn on sync' }));
  await screen.findByText(/^Synced/);
  settings.unmount();
}

async function agree(user, scope = screen) {
  await user.click(await scope.findByRole('button', { name: /turn on the Gemini helpers/i }));
}

function common() {
  beforeEach(() => {
    localStorage.clear();
    setServerUrl('https://server.example');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setServerUrl(null);
  });
}

describe('Analyze and organize an entry', () => {
  common();

  const ORGANIZED = { summary: 'A quiet walk by the water.', tags: ['canal', 'walking', 'friendship'], mood: 'Happy' };

  async function setUp(gemini, options = {}) {
    const user = userEvent.setup();
    startServer({ gemini, ...options });
    await seedEntries([{ id: 1, content: SECRET, mood: 'Peaceful', weatherType: 'Rain', temperature: '18°C', tags: ['canal'], locationName: 'Secret Street', date: recent(1) }]);
    await withSync(user);
    await renderAt('/entry/1');
    return { user, region: await screen.findByRole('region', { name: 'Organize this entry' }, { timeout: 15000 }) };
  }

  it('says what is sent and asks first; nothing is sent before a deliberate press', async () => {
    const gemini = fakeGemini({ body: reply(ORGANIZED) });
    const { user, region } = await setUp(gemini);

    expect(within(region).getByText(/only what that action needs is sent/i)).toBeInTheDocument();
    expect(within(region).getByText(/free tier, Google may use what is sent/i)).toBeInTheDocument();
    expect(within(region).getByText(/daily limits/i)).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: /Analyze and organize/ })).not.toBeInTheDocument();
    expect(gemini).not.toHaveBeenCalled();

    await agree(user, within(region));
    expect(await within(region).findByRole('button', { name: /Analyze and organize this entry/ })).toBeInTheDocument();
    expect(within(region).getByText(/text, date, mood and weather to Gemini/)).toBeInTheDocument();
    expect(gemini).not.toHaveBeenCalled(); // agreeing is not asking
  });

  it('shows summary, tags and a mood apart from the entry, and applies only what you choose', async () => {
    const gemini = fakeGemini({ body: reply(ORGANIZED) });
    const { user, region } = await setUp(gemini);
    await agree(user, within(region));

    await user.click(await within(region).findByRole('button', { name: /Analyze and organize this entry/ }));
    const panel = await within(region).findByRole('region', { name: 'Entry analysis' });
    expect(within(panel).getByText('AI-generated')).toBeInTheDocument();
    expect(within(panel).getByText('A quiet walk by the water.')).toBeInTheDocument();
    expect(within(panel).getByText('Requests left today: 29')).toBeInTheDocument();
    expect(within(panel).getByText('Nothing changes until you add a tag or use the mood.')).toBeInTheDocument();
    expect(within(panel).queryByText('canal')).not.toBeInTheDocument(); // already on the entry

    // What went to Gemini: the entry's words, mood and weather; not the place, and not its tags as data.
    const user_ = sentUser(gemini);
    expect(user_).toContain(SECRET);
    expect(user_).toContain('Peaceful');
    expect(user_).toContain('Rain, 18°C');
    expect(user_).not.toContain('Secret Street');

    // Nothing has been applied yet.
    let saved = (await loadEntries())[0];
    expect(saved.tags).toEqual(['canal']);
    expect(saved.mood).toBe('Peaceful');

    await user.click(within(panel).getByRole('button', { name: 'Add the tag “walking”' }));
    await waitFor(async () => expect((await loadEntries())[0].tags).toEqual(['canal', 'walking']));
    expect(await within(panel).findByText('Added')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Add the tag “friendship”' })).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Use the mood “Happy”' }));
    await waitFor(async () => expect((await loadEntries())[0].mood).toBe('Happy'));
    saved = (await loadEntries())[0];
    expect(saved.content).toBe(SECRET);
    expect(JSON.stringify(saved)).not.toContain('A quiet walk by the water');

    await user.click(within(panel).getByRole('button', { name: 'Dismiss' }));
    expect(within(region).queryByRole('region', { name: 'Entry analysis' })).not.toBeInTheDocument();
    expect(within(region).getByRole('button', { name: /Analyze and organize this entry/ })).toHaveFocus();
  });

  it('shows a busy, disabled button while working, and sends once for a double press', async () => {
    const gemini = fakeGemini({ body: reply(ORGANIZED) });
    const { user, region } = await setUp(gemini);
    await agree(user, within(region));

    const button = await within(region).findByRole('button', { name: /Analyze and organize this entry/ });
    await user.dblClick(button);
    expect(await within(region).findByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(within(region).getByRole('button', { name: 'Working…' })).toHaveAttribute('aria-busy', 'true');
    await within(region).findByText('A quiet walk by the water.');
    expect(gemini).toHaveBeenCalledTimes(1);
  });

  it('works when the entry has no mood or weather, and with no mood suggested', async () => {
    const gemini = fakeGemini({ body: reply({ summary: 'Short note.', tags: [], mood: null }) });
    const user = userEvent.setup();
    startServer({ gemini });
    await seedEntries([{ id: 1, content: 'Just a few words.', date: recent(1) }]);
    await withSync(user);
    await renderAt('/entry/1');
    const region = await screen.findByRole('region', { name: 'Organize this entry' });
    await agree(user, within(region));
    await user.click(await within(region).findByRole('button', { name: /Analyze and organize this entry/ }));
    expect(await within(region).findByText('Short note.')).toBeInTheDocument();
    expect(within(region).getByText('No new tags to suggest.')).toBeInTheDocument();
    expect(within(region).queryByText('Suggested mood')).not.toBeInTheDocument();
    expect(sentUser(gemini)).not.toMatch(/Mood chosen|Weather recorded/);
  });

  it('shows a clear, retryable error, and a retry is a new request', async () => {
    const gemini = fakeGemini({ status: 429, body: { error: { message: 'Quota exceeded for project 4242' } } }, { body: reply(ORGANIZED) });
    const { user, region } = await setUp(gemini);
    await agree(user, within(region));

    await user.click(await within(region).findByRole('button', { name: /Analyze and organize this entry/ }));
    const alert = await within(region).findByRole('alert');
    expect(alert).toHaveTextContent('A limit was reached for now. Try again later.');
    expect(document.body).not.toHaveTextContent('4242');
    expect(within(region).queryByRole('region', { name: 'Entry analysis' })).not.toBeInTheDocument(); // not shown as a result
    expect(gemini).toHaveBeenCalledTimes(1); // nothing retries by itself

    await user.click(within(region).getByRole('button', { name: 'Try again' }));
    expect(await within(region).findByText('A quiet walk by the water.')).toBeInTheDocument();
    expect(gemini).toHaveBeenCalledTimes(2);
  });

  it('shows an unusable reply as a failure, never as a result', async () => {
    const gemini = fakeGemini({ body: reply('Sure! Here are some tags: canal, walking') });
    const { user, region } = await setUp(gemini);
    await agree(user, within(region));
    await user.click(await within(region).findByRole('button', { name: /Analyze and organize this entry/ }));
    expect(await within(region).findByRole('alert')).toHaveTextContent('The AI service had a problem');
    expect(within(region).queryByText('AI-generated')).not.toBeInTheDocument();
  });

  it('says so when the server has no Gemini key, without exposing anything', async () => {
    const gemini = fakeGemini({ body: reply(ORGANIZED) });
    const { user, region } = await setUp(gemini, { key: null });
    await agree(user, within(region));
    await user.click(await within(region).findByRole('button', { name: /Analyze and organize this entry/ }));
    expect(await within(region).findByRole('alert')).toHaveTextContent('The Gemini helpers aren’t set up on this server yet.');
    expect(gemini).not.toHaveBeenCalled();
    // The entry and the rest of the page still work.
    expect(screen.getAllByText(SECRET).length).toBeGreaterThan(0);
  });

  it('can be turned off again', async () => {
    const { user, region } = await setUp(fakeGemini({ body: reply(ORGANIZED) }));
    await agree(user, within(region));
    await user.click(await within(region).findByRole('button', { name: 'Turn off the Gemini helpers' }));
    expect(await within(region).findByRole('button', { name: /turn on the Gemini helpers/i })).toBeInTheDocument();
  });

  it('needs sync, and offers nothing to press without it', async () => {
    const gemini = fakeGemini({ body: reply(ORGANIZED) });
    startServer({ gemini });
    await seedEntries([{ id: 1, content: 'Plain', date: recent(1) }]);
    await renderAt('/entry/1');
    const region = await screen.findByRole('region', { name: 'Organize this entry' });
    expect(within(region).getByText(/Turn on sync in Settings/)).toBeInTheDocument();
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(gemini).not.toHaveBeenCalled();
  });

  it('is fully translated', async () => {
    const user = userEvent.setup();
    startServer({ gemini: fakeGemini({ body: reply(ORGANIZED) }) });
    await seedEntries([{ id: 1, content: 'नमस्ते', date: recent(1) }]);
    const settings = await renderAt('/settings', 'hi');
    // The sync panel itself is not translated yet (an existing gap). The test
    // helper only knows the English "Opening your journal…" text, so wait for
    // the button explicitly.
    await user.click(await screen.findByRole('button', { name: 'Turn on sync' }));
    await screen.findByText(/^Synced/);
    settings.unmount();
    await renderAt('/entry/1', 'hi');
    const region = await screen.findByRole('region', { name: 'इस एंट्री को व्यवस्थित करें' });
    expect(within(region).getByText(/Google की Gemini सेवा को/)).toBeInTheDocument();
  });
});

describe('Plan my day', () => {
  common();

  const DAILY = {
    time: ['2026-11-22', '2026-11-23', '2026-11-24'],
    weather_code: [61, 1, 3],
    temperature_2m_max: [11, 14, 9],
    temperature_2m_min: [6, 7, 4],
    precipitation_sum: [4.2, 0, 0.5],
    uv_index_max: [1.5, 3, 1],
  };
  const LOCATED = { id: 1, content: SECRET, mood: 'Happy', date: recent(1), latitude: 51.5, longitude: -0.12, locationName: 'London' };
  const PLAN = { suggestions: ['Take a walk between showers.', 'Keep the evening for reading.'], question: 'What slowed you down today?' };

  async function setUp(gemini) {
    const user = userEvent.setup();
    const weather = vi.fn(async () => ({ ok: true, json: async () => ({ daily: DAILY }) }));
    startServer({ gemini, weather });
    await seedEntries([LOCATED]);
    await withSync(user);
    await renderAt('/');
    return { user, weather };
  }

  it('is not offered until the forecast has been loaded, and loading is a separate, explicit step', async () => {
    const { weather } = await setUp(fakeGemini({ body: reply(PLAN) }));
    expect(screen.queryByRole('heading', { name: 'Plan my day' })).not.toBeInTheDocument();
    expect(weather).not.toHaveBeenCalled();
  });

  it('plans from the forecast already loaded, without another weather request or any journal text', async () => {
    const gemini = fakeGemini({ body: reply(PLAN) });
    const { user, weather } = await setUp(gemini);

    await user.click(screen.getByRole('button', { name: 'Check the forecast' }));
    await screen.findByRole('heading', { name: 'Plan my day' });
    expect(weather).toHaveBeenCalledTimes(1);

    await agree(user);
    await user.selectOptions(await screen.findByLabelText('I’d like'), 'creative');
    expect(screen.getByText(/Sends only that day’s forecast numbers and your choice/)).toBeInTheDocument();
    expect(screen.getByText(/Based on the forecast for .*2026.*, loaded at/)).toBeInTheDocument();
    expect(gemini).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Plan my day' }));
    const panel = await screen.findByRole('region', { name: 'Day plan' });
    expect(within(panel).getByText('AI-generated')).toBeInTheDocument();
    expect(within(panel).getByText('Take a walk between showers.')).toBeInTheDocument();
    expect(within(panel).getByText('What slowed you down today?')).toBeInTheDocument();
    expect(within(panel).getByText(/Weather doesn’t decide how you feel/)).toBeInTheDocument();
    expect(within(panel).getByText(/Based on the forecast for/)).toBeInTheDocument();

    expect(weather).toHaveBeenCalledTimes(1); // no extra weather request for Gemini
    const sent = sentUser(gemini);
    expect(sent).toContain('Forecast for 2026-11-22');
    expect(sent).toContain('high 11°C');
    expect(sent).toContain('something creative');
    expect(gemini.mock.calls[0][1].body).not.toContain(SECRET);
    expect(gemini.mock.calls[0][1].body).not.toContain('London');
  });

  it('lets you pick another day of the forecast', async () => {
    const gemini = fakeGemini({ body: reply(PLAN) });
    const { user } = await setUp(gemini);
    await user.click(screen.getByRole('button', { name: 'Check the forecast' }));
    await agree(user);
    await user.selectOptions(await screen.findByLabelText('Day'), '1');
    await user.click(screen.getByRole('button', { name: 'Plan my day' }));
    await screen.findByRole('region', { name: 'Day plan' });
    expect(sentUser(gemini)).toContain('Forecast for 2026-11-23');
  });

  it('refuses a forecast that has gone stale, and asks to check again', async () => {
    const gemini = fakeGemini({ body: reply(PLAN) });
    const { user } = await setUp(gemini);
    await user.click(screen.getByRole('button', { name: 'Check the forecast' }));
    await agree(user);
    const button = await screen.findByRole('button', { name: 'Plan my day' });

    const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 4 * 3600 * 1000);
    try {
      await user.click(button);
      expect(await screen.findByRole('alert')).toHaveTextContent('loaded a while ago');
      expect(screen.getByRole('button', { name: 'Plan my day' })).toBeDisabled();
      expect(gemini).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('shows a failure as a failure, with a way to try again', async () => {
    const gemini = fakeGemini({ status: 500, body: {} }, { body: reply(PLAN) });
    const { user } = await setUp(gemini);
    await user.click(screen.getByRole('button', { name: 'Check the forecast' }));
    await agree(user);
    await user.click(await screen.findByRole('button', { name: 'Plan my day' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI service had a problem');
    expect(screen.queryByRole('region', { name: 'Day plan' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Take a walk between showers.')).toBeInTheDocument();
  });
});

describe('Ask Gemini for a writing prompt', () => {
  common();

  const PROMPT = { prompt: 'What is one small thing you noticed today that you usually walk past?' };
  const box = () => screen.getByLabelText(/what.s on your mind/i);

  async function setUp(gemini, entries) {
    const user = userEvent.setup();
    startServer({ gemini });
    if (entries) await seedEntries(entries);
    await withSync(user);
    await renderAt('/new');
    // The panel is loaded on demand, which can be slow on a busy machine.
    await user.click(await screen.findByRole('button', { name: 'Ask Gemini for a writing prompt' }, { timeout: 15000 }));
    await agree(user);
    // Agreeing is saved asynchronously; wait until the controls appear.
    await screen.findByRole('button', { name: 'Get a prompt' });
    return { user };
  }

  it('is tucked behind one small button, and sends nothing until you ask', async () => {
    const gemini = fakeGemini({ body: reply(PROMPT) });
    startServer({ gemini });
    await renderAt('/new');
    expect(await screen.findByRole('button', { name: 'Ask Gemini for a writing prompt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get a prompt' })).not.toBeInTheDocument();
    expect(gemini).not.toHaveBeenCalled();
  });

  it('works with no earlier entries and no weather, and keeps the prompt out of the draft until used', async () => {
    const gemini = fakeGemini({ body: reply(PROMPT) });
    const { user } = await setUp(gemini);
    expect(screen.getByText('You have no earlier entries to use yet.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'You have no earlier entries to use yet.' })).toBeDisabled();
    expect(screen.getByText(/Sends today’s date and the weather type. No journal text./)).toBeInTheDocument();

    await user.type(box(), 'My own first words');
    await user.click(await screen.findByRole('button', { name: 'Get a prompt' }));
    const panel = await screen.findByRole('region', { name: 'Prompt from Gemini' });
    expect(within(panel).getByText('AI-generated')).toBeInTheDocument();
    expect(within(panel).getByText(PROMPT.prompt)).toBeInTheDocument();
    expect(box().value).toBe('My own first words'); // not inserted yet
    expect(sentUser(gemini)).toMatch(/^Today is \d{4}-\d{2}-\d{2}\.$/);

    await user.click(within(panel).getByRole('button', { name: 'Use this prompt' }));
    expect(box().value).toBe(`${PROMPT.prompt}\n\nMy own first words`);
    expect(screen.queryByRole('region', { name: 'Prompt from Gemini' })).not.toBeInTheDocument();
  });

  it('uses recent entries only when you tick the box, and only their opening lines', async () => {
    const gemini = fakeGemini({ body: reply(PROMPT) });
    const entries = [1, 2, 3, 4].map((n) => ({ id: n, content: `Entry ${n} ${'long '.repeat(200)}`, date: recent(n) }));
    const { user } = await setUp(gemini, entries);

    expect(screen.getByText(/No journal text\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get a prompt' }));
    await screen.findByRole('region', { name: 'Prompt from Gemini' });
    expect(gemini.mock.calls[0][1].body).not.toContain('Entry 1');

    await user.click(screen.getByRole('checkbox', { name: /opening lines of my last 3 entries/ }));
    expect(screen.getByText(/and the opening lines of your last 3 entries/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Another one' }));
    await waitFor(() => expect(gemini).toHaveBeenCalledTimes(2));
    const second = sentUser(gemini, 1);
    expect(second).toContain('Entry 1');
    expect(second).toContain('Entry 3');
    expect(second).not.toContain('Entry 4'); // only the latest three... Entry 4 is the oldest here
    expect(second.length).toBeLessThan(1500);
  });

  it('shows a failure in words, and can be closed without touching the draft', async () => {
    const gemini = fakeGemini({ status: 429, body: { error: { message: 'Quota' } } });
    const { user } = await setUp(gemini);
    await user.type(box(), 'Draft text');
    await user.click(await screen.findByRole('button', { name: 'Get a prompt' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A limit was reached for now');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(box().value).toBe('Draft text');
    expect(screen.queryByRole('button', { name: 'Get a prompt' })).not.toBeInTheDocument();
  });

  it('is not offered when editing an existing entry', async () => {
    startServer({ gemini: fakeGemini({ body: reply(PROMPT) }) });
    await seedEntries([{ id: 1, content: 'Old', date: recent(1) }]);
    await renderWithJournal(
      <Routes>
        <Route path="/edit/:id" element={<EntryFormPage />} />
      </Routes>,
      { initialEntries: ['/edit/1'] },
    );
    expect(screen.queryByRole('button', { name: 'Ask Gemini for a writing prompt' })).not.toBeInTheDocument();
  });
});

describe('Review a period', () => {
  common();

  const REVIEW = {
    insufficient: false,
    themes: ['Long walks', 'Busy weekdays'],
    notableMoments: ['Wednesday: a missed call'],
    interpretation: 'One possibility is that busy days left less room for calm.',
    question: 'What would make next week calmer?',
  };
  const moods = ['Sad', 'Happy', 'Peaceful'];
  const many = (count, extra = {}) =>
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      content: `SECRET writing number ${i}`,
      mood: moods[i % 3],
      weatherType: i % 2 ? 'Rain' : 'Clear',
      temperature: `${10 + i}°C`,
      date: recent(i),
      ...extra,
    }));

  async function setUp(entries, gemini) {
    const user = userEvent.setup();
    startServer({ gemini });
    await seedEntries(entries);
    await withSync(user);
    await renderAt('/insights');
    const region = await screen.findByRole('region', { name: 'Review a period' });
    await agree(user, within(region));
    await within(region).findByRole('button', { name: /Review this period/ });
    return { user, region };
  }

  it('shows the period, the entry count and what will be sent, and sends nothing yet', async () => {
    const gemini = fakeGemini({ body: reply(REVIEW) });
    const { region } = await setUp(many(5), gemini);
    expect(within(region).getByText(/· 5 entries$/)).toBeInTheDocument();
    expect(within(region).getByText(/Sends counts worked out on this device and a short excerpt \(the first 300 characters\) from 5 of these entries/)).toBeInTheDocument();
    expect(within(region).getByRole('combobox', { name: 'Period' })).toHaveValue('7');
    expect(gemini).not.toHaveBeenCalled();
  });

  it('returns observations, interpretation and a question as separate parts, with the period and sample size', async () => {
    const gemini = fakeGemini({ body: reply(REVIEW) });
    const { user, region } = await setUp(many(5), gemini);
    await user.click(within(region).getByRole('button', { name: /Review this period/ }));

    const panel = await within(region).findByRole('region', { name: 'Review result' });
    expect(within(panel).getByText('AI-generated')).toBeInTheDocument();
    expect(within(panel).getByText(/· 5 entries · 5 excerpts sent/)).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'What the entries and numbers show' })).toBeInTheDocument();
    expect(within(panel).getByText('Long walks')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Notable moments' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'One possible interpretation' })).toBeInTheDocument();
    expect(within(panel).getByText(/One possibility is/)).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'A question to reflect on' })).toBeInTheDocument();
    expect(within(panel).getByText(/the interpretation is a guess, not a cause or a prediction/)).toBeInTheDocument();
    expect(sentSystem(gemini)).toMatch(/never say it caused/);
  });

  it('sends only entries inside the chosen period, as short excerpts', async () => {
    const gemini = fakeGemini({ body: reply(REVIEW) });
    const entries = [...many(3), { id: 99, content: 'OLD private words from long ago', mood: 'Sad', date: recent(60) }];
    const { user, region } = await setUp(entries, gemini);
    await user.click(within(region).getByRole('button', { name: /Review this period/ }));
    await within(region).findByRole('region', { name: 'Review result' });
    const sent = sentUser(gemini);
    expect(sent).toContain('SECRET writing number 0');
    expect(sent).not.toContain('OLD private words');
    expect(sent).toContain('Excerpts (3 of 3 entries)');

    // A wider period brings the older entry in.
    await user.selectOptions(within(region).getByRole('combobox', { name: 'Period' }), '90');
    expect(within(region).getByText(/· 4 entries$/)).toBeInTheDocument();
  });

  it('bounds how much entry text is sent', async () => {
    const gemini = fakeGemini({ body: reply(REVIEW) });
    const { user, region } = await setUp(many(30, { content: `Start ${'z'.repeat(2000)}` }), gemini);
    await user.selectOptions(within(region).getByRole('combobox', { name: 'Period' }), '30');
    expect(within(region).getByText(/from 20 of these entries/)).toBeInTheDocument();
    await user.click(within(region).getByRole('button', { name: /Review this period/ }));
    await within(region).findByRole('region', { name: 'Review result' });
    const sent = sentUser(gemini);
    expect((sent.match(/<entry>/g) || []).length).toBe(20);
    expect(sent).not.toContain('z'.repeat(301));
  });

  it('works for entries with no mood and no weather', async () => {
    const gemini = fakeGemini({ body: reply(REVIEW) });
    const bare = many(4).map((e) => ({ ...e, mood: undefined, weatherType: undefined, temperature: undefined }));
    const { user, region } = await setUp(bare, gemini);
    await user.click(within(region).getByRole('button', { name: /Review this period/ }));
    await within(region).findByText('Long walks');
    expect(sentUser(gemini)).toContain('0 have recorded weather');
  });

  it('says there is not enough instead of inventing a pattern', async () => {
    const gemini = fakeGemini({ body: reply(REVIEW) });
    const { region } = await setUp(many(2), gemini);
    expect(within(region).getByText(/At least 3 entries are needed for a review. This period has 2./)).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: /Review this period/ })).toBeDisabled();
    expect(gemini).not.toHaveBeenCalled();
  });

  it('shows the model’s own "not enough" as that, not as a pattern', async () => {
    const gemini = fakeGemini({ body: reply({ insufficient: true }) });
    const { user, region } = await setUp(many(6), gemini);
    await user.click(within(region).getByRole('button', { name: /Review this period/ }));
    expect(await within(region).findByText(/There isn’t enough here to say anything real/)).toBeInTheDocument();
    expect(within(region).queryByRole('heading', { name: 'One possible interpretation' })).not.toBeInTheDocument();
  });

  it('lets you choose your own dates, within 92 days and not in the future', async () => {
    const gemini = fakeGemini({ body: reply(REVIEW) });
    const { user, region } = await setUp(many(6), gemini);
    await user.selectOptions(within(region).getByRole('combobox', { name: 'Period' }), 'custom');

    fireEvent.change(within(region).getByLabelText('From'), { target: { value: '2025-01-01' } });
    expect(await within(region).findByRole('alert')).toHaveTextContent('Choose dates up to 92 days apart, ending no later than today.');
    expect(within(region).getByRole('button', { name: /Review this period/ })).toBeDisabled();

    fireEvent.change(within(region).getByLabelText('From'), { target: { value: localDay(new Date(Date.now() - 10 * 86400000)) } });
    expect(within(region).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(region).getByRole('button', { name: /Review this period/ })).toBeEnabled();
    await user.click(within(region).getByRole('button', { name: /Review this period/ }));
    await within(region).findByText('Long walks');
    expect(gemini).toHaveBeenCalledTimes(1);
  });

  it('shows a failure in words, and a retry is a new request', async () => {
    const gemini = fakeGemini({ status: 500, body: {} }, { body: reply(REVIEW) });
    const { user, region } = await setUp(many(5), gemini);
    await user.click(within(region).getByRole('button', { name: /Review this period/ }));
    expect(await within(region).findByRole('alert')).toHaveTextContent('The AI service had a problem');
    expect(gemini).toHaveBeenCalledTimes(1);
    await user.click(within(region).getByRole('button', { name: 'Try again' }));
    expect(await within(region).findByText('Long walks')).toBeInTheDocument();
    expect(gemini).toHaveBeenCalledTimes(2);
  });

  it('is in Hindi when the app is', async () => {
    const user = userEvent.setup();
    startServer({ gemini: fakeGemini({ body: reply(REVIEW) }) });
    await seedEntries(many(4));
    const settings = await renderAt('/settings', 'hi');
    await user.click(await screen.findByRole('button', { name: 'Turn on sync' }));
    await screen.findByText(/^Synced/);
    settings.unmount();
    await renderAt('/insights', 'hi');
    expect(await screen.findByRole('region', { name: 'किसी अवधि की समीक्षा' })).toBeInTheDocument();
  });
});
