import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { EntryDetail } from '../../src/pages/EntryDetail.jsx';
import { Settings } from '../../src/pages/Settings.jsx';
import { setEmbedderFactory } from '../../src/lib/embedder.js';
import { loadSetting } from '../../src/lib/storage.js';
import { MODEL_ID } from '../../src/lib/semantic.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';
import { makeFakeFactory } from '../helpers/fakeEmbedder.js';

const ENTRIES = [
  { id: 1, content: 'Felt so nervous before the meeting at the office', mood: 'Anxious', date: '2026-10-01T10:00' },
  { id: 2, content: 'Sunny day at the beach, warm and bright', mood: 'Happy', date: '2026-10-02T10:00' },
  { id: 3, content: 'Stressed about the deadline, my boss is worried too', mood: 'Anxious', date: '2026-10-03T10:00' },
  { id: 4, content: 'Rain all day, I stayed in with an umbrella', mood: 'Peaceful', date: '2026-10-04T10:00' },
];

function renderApp(path = '/settings') {
  return renderWithJournal(
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/entry/:id" element={<EntryDetail />} />
    </Routes>,
    { initialEntries: [path] },
  );
}

async function turnOn(user) {
  const section = screen.getByRole('region', { name: 'Search by meaning' });
  await user.click(within(section).getByRole('button', { name: 'Turn on search by meaning' }));
  await within(section).findByText(/Ready\. 4 entries can be found by meaning/, {}, { timeout: 5000 });
  return section;
}

describe('Search by meaning', () => {
  let fake;
  beforeEach(() => {
    localStorage.clear();
    fake = makeFakeFactory();
    setEmbedderFactory(fake.factory);
  });
  afterEach(() => setEmbedderFactory(null));

  it('is off by default and does not load the model', async () => {
    await seedEntries(ENTRIES);
    await renderApp();
    const section = screen.getByRole('region', { name: 'Search by meaning' });
    expect(within(section).getByText(/never leave this device/i)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Turn on search by meaning' })).toBeInTheDocument();
    expect(fake.calls.loads).toBe(0);
  });

  it('turns on, builds the index, and saves it with the journal', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    await renderApp();
    await turnOn(user);

    expect(fake.calls.loads).toBe(1);
    expect(fake.calls.texts).toHaveLength(4);
    const saved = await loadSetting('semantic');
    expect(saved).toMatchObject({ enabled: true, model: MODEL_ID });
    expect(Object.keys(saved.index).sort()).toEqual(['1', '2', '3', '4']);
    expect(JSON.stringify(saved)).not.toMatch(/nervous|beach/); // vectors, not text
  });

  it('only reads new entries on a later visit, from the saved index', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    const first = await renderApp();
    await turnOn(user);
    first.unmount();

    const again = makeFakeFactory();
    setEmbedderFactory(again.factory);
    await renderApp();
    const section = screen.getByRole('region', { name: 'Search by meaning' });
    expect(await within(section).findByText(/Ready\. 4 entries/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1800)); // longer than the top-up delay
    expect(again.calls.texts).toHaveLength(0);
    expect(again.calls.loads).toBe(0);
  });

  it('ranks Dashboard results by meaning when "By meaning" is on', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    const settings = await renderApp();
    await turnOn(user);
    settings.unmount();

    await renderApp('/');
    const search = screen.getByRole('textbox', { name: /search journal entries/i });

    // Plain words: nothing contains "overwhelmed".
    await user.type(search, 'overwhelmed by work');
    await waitFor(() => expect(screen.getByText(/no entries/i)).toBeInTheDocument(), { timeout: 3000 }).catch(() => {});
    expect(screen.queryByText(/nervous before the meeting/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Search by meaning' }));
    await waitFor(() => expect(screen.getByText(/closest in meaning first/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/nervous before the meeting/)).toBeInTheDocument();
    expect(screen.getByText(/Stressed about the deadline/)).toBeInTheDocument();
    expect(screen.queryByText(/Sunny day at the beach/)).not.toBeInTheDocument();
    expect(screen.getByText('2 entries', { exact: false })).toBeInTheDocument();
  });

  it('still applies operators like mood: in meaning mode', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    const settings = await renderApp();
    await turnOn(user);
    settings.unmount();

    await renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Search by meaning' }));
    await user.type(screen.getByRole('textbox', { name: /search journal entries/i }), 'worried about work mood:peaceful');
    expect((await screen.findAllByText(/^0 entries/, {}, { timeout: 3000 })).length).toBeGreaterThan(0);
  });

  it('hides the toggle when search by meaning is off', async () => {
    await seedEntries(ENTRIES);
    await renderApp('/');
    expect(screen.queryByRole('button', { name: 'Search by meaning' })).not.toBeInTheDocument();
  });

  it('lists entries close in meaning first under Related entries', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    const settings = await renderApp();
    await turnOn(user);
    settings.unmount();

    await renderApp('/entry/1');
    const related = await screen.findByRole('region', { name: 'Related entries' });
    expect(within(related).getAllByRole('link')[0]).toHaveTextContent(/Stressed about the deadline/);
  });

  it('turning it off deletes the index', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    await renderApp();
    const section = await turnOn(user);

    await user.click(within(section).getByRole('button', { name: /turn off and delete the index/i }));
    expect(await within(section).findByRole('button', { name: 'Turn on search by meaning' })).toBeInTheDocument();
    await waitFor(async () => expect(await loadSetting('semantic')).toEqual({ enabled: false, model: MODEL_ID, index: {} }));
  });

  it('says what went wrong when the model cannot load, and can try again', async () => {
    const user = userEvent.setup();
    setEmbedderFactory(makeFakeFactory({ fail: true }).factory);
    await seedEntries(ENTRIES);
    await renderApp();
    const section = screen.getByRole('region', { name: 'Search by meaning' });
    await user.click(within(section).getByRole('button', { name: 'Turn on search by meaning' }));
    expect(await within(section).findByText(/could not load the search model/i, {}, { timeout: 5000 })).toBeInTheDocument();

    setEmbedderFactory(makeFakeFactory().factory);
    await user.click(within(section).getByRole('button', { name: 'Try again' }));
    expect(await within(section).findByText(/Ready\. 4 entries/, {}, { timeout: 5000 })).toBeInTheDocument();
  }, 15000);
});
