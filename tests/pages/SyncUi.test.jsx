import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../../src/pages/Settings.jsx';
import { Insights } from '../../src/pages/Insights.jsx';
import { loadEntries, loadSetting } from '../../src/lib/storage.js';
import { setServerUrl } from '../../src/lib/syncClient.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';
import { handle } from '../../worker/src/index.js';

// The real server code in memory, reached through a stubbed fetch.
function startServer(deps = {}) {
  const store = new Map();
  const env = {
    ALLOWED_ORIGINS: '',
    ANTHROPIC_API_KEY: 'test',
    JOURNAL: {
      get: async (k, type) => (store.has(k) ? (type === 'json' ? JSON.parse(store.get(k)) : store.get(k)) : null),
      put: async (k, v) => store.set(k, v),
      delete: async (k) => store.delete(k),
      list: async () => ({ keys: [], list_complete: true }),
    },
  };
  vi.stubGlobal('fetch', (url, init) => handle(new Request(url, init), env, deps));
  return store;
}

function renderAt(path) {
  return renderWithJournal(
    <Routes>
      <Route path="/settings" element={<Settings />} />
      <Route path="/insights" element={<Insights />} />
    </Routes>,
    { initialEntries: [path] },
  );
}

describe('Sync settings', () => {
  beforeEach(() => {
    localStorage.clear();
    setServerUrl('https://server.example');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setServerUrl(null);
  });

  it('asks for a server address when none is set', async () => {
    setServerUrl(null);
    await renderAt('/settings');
    expect(screen.getByLabelText('Server address')).toBeInTheDocument();
  });

  it('turns on sync, then a second device joins with the code and gets the entries', async () => {
    const user = userEvent.setup();
    const store = startServer();
    await seedEntries([{ id: 1, content: 'From the first device', date: '2026-10-01T10:00' }]);

    const first = await renderAt('/settings');
    await user.click(screen.getByRole('button', { name: 'Turn on sync' }));
    await screen.findByText(/^Synced/);
    await user.click(screen.getByRole('button', { name: 'Show sync code' }));
    const code = screen.getByText((_, el) => el?.tagName === 'CODE' && el.textContent.length > 40).textContent;
    expect([...store.values()].join()).not.toContain('From the first device');
    first.unmount();

    // A second device: a fresh, empty journal.
    globalThis.indexedDB = new IDBFactory();
    await renderAt('/settings');
    await user.type(screen.getByLabelText(/enter its sync code/i), code);
    await user.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(async () => expect((await loadEntries()).map((e) => e.content)).toEqual(['From the first device']));
    expect((await loadSetting('sync')).code).toBe(code.replace(/\s/g, ''));
  });

  it('rejects a mistyped code', async () => {
    const user = userEvent.setup();
    startServer();
    await renderAt('/settings');

    await user.type(screen.getByLabelText(/enter its sync code/i), 'not-a-code');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/doesn't look like a sync code/);
  });

  it('can delete the server copy, after confirming', async () => {
    const user = userEvent.setup();
    const store = startServer();
    await renderAt('/settings');
    await user.click(screen.getByRole('button', { name: 'Turn on sync' }));
    await screen.findByText(/^Synced/);
    expect(store.size).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /delete the synced copy/i }));
    await user.click(screen.getByRole('button', { name: 'Delete from server' }));

    expect(await screen.findByText('The server copy is deleted.')).toBeInTheDocument();
    expect(store.size).toBe(0);
  });

  it('explains that reminders need sync first', async () => {
    startServer();
    await renderAt('/settings');
    const reminder = screen.getByRole('region', { name: 'Daily reminder' });
    expect(within(reminder).getByText(/turn on sync first/i)).toBeInTheDocument();
  });
});

describe('AI reflections', () => {
  beforeEach(() => {
    localStorage.clear();
    setServerUrl('https://server.example');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setServerUrl(null);
  });

  it('stay off until opted in, then send only the chosen fields', async () => {
    const user = userEvent.setup();
    const create = vi.fn(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'You found calm in the rain.' }] }));
    startServer({ client: { beta: { messages: { create } } } });
    await seedEntries([
      {
        id: 1,
        content: 'Rain on the **window**',
        mood: 'Peaceful',
        weatherType: 'Rain',
        temperature: '18°C',
        tags: ['secret-tag'],
        locationName: 'Secret Street',
        images: ['data:image/png;base64,AAA'],
        date: new Date(Date.now() - 86400000).toISOString(),
      },
    ]);

    const settings = await renderAt('/settings');
    await user.click(screen.getByRole('button', { name: 'Turn on sync' }));
    await screen.findByText(/^Synced/);
    settings.unmount();

    await renderAt('/insights');
    const section = screen.getByRole('region', { name: 'Reflections' });
    expect(within(section).getByText(/photos, voice memos, places, and tags never are/i)).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Turn on AI reflections' }));
    await user.click(await within(section).findByRole('button', { name: /reflect on the past 7 days/i }));

    expect(await within(section).findByText('You found calm in the rain.')).toBeInTheDocument();
    const sent = create.mock.calls[0][0].messages[0].content;
    expect(sent).toContain('Rain on the window');
    expect(sent).toContain('Mood: Peaceful');
    expect(sent).not.toContain('secret-tag');
    expect(sent).not.toContain('Secret Street');
    expect(sent).not.toContain('data:image');
  });
});
