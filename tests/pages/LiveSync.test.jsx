import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../../src/components/AppLayout/AppLayout.jsx';
import { Settings } from '../../src/pages/Settings.jsx';
import { useEntriesContext } from '../../src/context/EntriesContext.jsx';
import { EntryDetail } from '../../src/pages/EntryDetail.jsx';
import { loadEntries, loadSetting } from '../../src/lib/storage.js';
import { setServerUrl, syncJournal } from '../../src/lib/syncClient.js';
import { SYNC_TIMING } from '../../src/lib/syncStatus.js';
import { handle } from '../../worker/src/index.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

const ORIGINAL_TIMING = { ...SYNC_TIMING };

// The real worker in memory. `net.down` makes every request fail like a
// lost connection; `net.requests` records what was asked.
function startServer() {
  const store = new Map();
  const net = { down: false, requests: [], status: null };
  const env = {
    ALLOWED_ORIGINS: '',
    JOURNAL: {
      get: async (k, type) => (store.has(k) ? (type === 'json' ? JSON.parse(store.get(k)) : store.get(k)) : null),
      put: async (k, v) => store.set(k, v),
      delete: async (k) => store.delete(k),
      list: async () => ({ keys: [], list_complete: true }),
    },
  };
  let clock = Date.now();
  const deps = { now: () => (clock += 2000) };
  const fetchImpl = (url, init) => {
    net.requests.push(`${init?.method || 'GET'} ${new URL(url).pathname.replace(/\/v1\/vaults\/[0-9a-f]+/, '')}`);
    if (net.down) return Promise.reject(new TypeError('Failed to fetch'));
    if (net.status) return Promise.resolve(new Response(JSON.stringify({ error: 'forced' }), { status: net.status }));
    return handle(new Request(url, init), env, deps);
  };
  vi.stubGlobal('fetch', fetchImpl);
  return { store, net, fetchImpl };
}

// Stands in for the write page: adds an entry from inside the app.
function Writer() {
  const { addEntry } = useEntriesContext();
  return (
    <button type="button" onClick={() => addEntry({ content: 'Written offline', date: '2026-10-05T10:00' })}>
      Add test entry
    </button>
  );
}

function renderApp(path = '/settings') {
  return renderWithJournal(
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path="/settings"
          element={
            <>
              <Settings />
              <Writer />
            </>
          }
        />
        <Route path="/entry/:id" element={<EntryDetail />} />
      </Route>
    </Routes>,
    { initialEntries: [path] },
  );
}

async function turnOnSync(user) {
  await user.click(screen.getByRole('button', { name: 'Turn on sync' }));
  await screen.findByText(/^Synced/);
}

const requestsTo = (net, text) => net.requests.filter((r) => r.includes(text));

describe('Live and offline sync', () => {
  beforeEach(() => {
    localStorage.clear();
    setServerUrl('https://server.example');
    Object.assign(SYNC_TIMING, { pollMs: 40, minCheckGapMs: 0, afterChangeMs: 60, backoffMs: [250, 400] });
  });

  afterEach(async () => {
    // Close the app first, so nothing new can start, then give a sync that
    // was already running a moment to finish its writes. Otherwise they
    // could land in the next test's fresh storage.
    cleanup();
    await new Promise((r) => setTimeout(r, 200));
    Object.assign(SYNC_TIMING, ORIGINAL_TIMING);
    vi.unstubAllGlobals();
    setServerUrl(null);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('picks up an entry written on another device without any action here', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await seedEntries([{ id: 1, content: 'Mine', date: '2026-10-01T10:00', updatedAt: 1000 }]);
    await renderApp();
    await turnOnSync(user);
    const code = (await loadSetting('sync')).code;

    // The other device uploads a new entry.
    await syncJournal({
      code,
      knownVersion: 1,
      local: { entries: [{ id: 2, content: 'From the phone', date: '2026-10-02T10:00', updatedAt: Date.now() }], tombstones: {} },
      fetchImpl: server.fetchImpl,
      sleep: async () => {},
    });

    await waitFor(async () => expect((await loadEntries()).map((e) => e.content).sort()).toEqual(['From the phone', 'Mine']), {
      timeout: 4000,
    });
  });

  it('asks cheaply while nothing changes: only version checks, no journal downloads', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await renderApp();
    await turnOnSync(user);
    const journalCalls = requestsTo(server.net, '/journal').length;

    await waitFor(() => expect(requestsTo(server.net, '/version').length).toBeGreaterThanOrEqual(3), { timeout: 4000 });
    expect(requestsTo(server.net, '/journal')).toHaveLength(journalCalls);
    // Turning sync on uploaded once. Nothing since.
    expect(requestsTo(server.net, 'PUT /journal')).toHaveLength(1);
  });

  it('does not check while the page is hidden, and checks the moment it is visible again', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await renderApp();
    await turnOnSync(user);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await new Promise((r) => setTimeout(r, 150));
    const whileHidden = requestsTo(server.net, '/version').length;
    await new Promise((r) => setTimeout(r, 150));
    expect(requestsTo(server.net, '/version')).toHaveLength(whileHidden);

    SYNC_TIMING.pollMs = 60_000; // only the return can trigger a check now
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(requestsTo(server.net, '/version').length).toBeGreaterThan(whileHidden));
  });

  it('checks when the window gets focus', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await renderApp();
    await turnOnSync(user);
    SYNC_TIMING.pollMs = 60_000;
    await new Promise((r) => setTimeout(r, 100));
    const before = requestsTo(server.net, '/version').length;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(requestsTo(server.net, '/version').length).toBeGreaterThan(before));
  });

  it('keeps working offline, says how many changes are waiting, and catches up by itself', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await renderApp();
    await turnOnSync(user);
    const uploads = () => requestsTo(server.net, 'PUT /journal').length;
    expect(uploads()).toBe(1);

    // The connection drops, and the person writes an entry.
    server.net.down = true;
    await user.click(screen.getByRole('button', { name: 'Add test entry' }));

    const offline = await screen.findAllByText(
      'Offline. 1 change saved on this device will sync when you are back online.',
      {},
      { timeout: 4000 },
    );
    expect(offline.length).toBeGreaterThan(0); // in Settings and in the bar on every page
    expect((await loadEntries()).map((e) => e.content)).toEqual(['Written offline']); // safe on the device

    // Back online: it goes up by itself, without a button press.
    server.net.down = false;
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(uploads()).toBe(2), { timeout: 4000 });
    expect((await screen.findAllByText(/^Synced/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-status]')).toBeNull();
  });

  it('retries after a failure with growing waits, then recovers', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await renderApp();
    await turnOnSync(user);

    server.net.status = 503;
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect((await screen.findAllByText(/Sync problem: forced Trying again soon/)).length).toBeGreaterThan(0);
    // The sync-status bar shows it on every page, with a way to the details.
    const bar = document.querySelector('[data-status="error"]');
    expect(bar).toHaveTextContent(/Sync problem/);
    expect(within(bar).getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/settings');

    const failedSyncs = () => requestsTo(server.net, 'GET /journal').length;
    await waitFor(() => expect(failedSyncs()).toBeGreaterThanOrEqual(3), { timeout: 4000 }); // it keeps trying

    server.net.status = null;
    expect(await screen.findByText(/^Synced/, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(document.querySelector('[data-status="error"]')).toBeNull();
  });

  it('reports being offline in plain words', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await renderApp();
    await turnOnSync(user);

    server.net.down = true;
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect((await screen.findAllByText(/^Offline\. Everything is saved on this device/)).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-status="offline"]')).toBeInTheDocument();
    expect(document.querySelector('[data-status="offline"]').querySelector('a')).toBeNull(); // nothing to look at
  });

  it('pauses, instead of bringing the journal back, when its server copy was deleted elsewhere', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await seedEntries([{ id: 1, content: 'Keep me', date: '2026-10-01T10:00', updatedAt: 1000 }]);
    await renderApp();
    await turnOnSync(user);
    expect(server.store.size).toBeGreaterThan(0);

    // Another device deletes the synced copy on purpose.
    server.store.clear();

    expect((await screen.findAllByText(/Sync is paused\. The synced copy was deleted/, {}, { timeout: 4000 })).length).toBeGreaterThan(0);
    // Time passes; nothing is quietly uploaded again.
    await new Promise((r) => setTimeout(r, 300));
    expect(server.store.size).toBe(0);
    expect((await loadEntries()).map((e) => e.content)).toEqual(['Keep me']); // nothing lost here

    // The person chooses to share this journal again.
    await user.click(screen.getByRole('button', { name: 'Upload this journal again' }));
    expect(await screen.findByText(/^Synced/)).toBeInTheDocument();
    expect(server.store.size).toBeGreaterThan(0);
  });

  it('pauses when the server says the sync code is wrong, and "Sync now" tries again', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await renderApp();
    await turnOnSync(user);

    server.net.status = 403;
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect((await screen.findAllByText(/Sync is paused\. This device.s sync code no longer matches/)).length).toBeGreaterThan(0);
    const before = server.net.requests.length;
    await new Promise((r) => setTimeout(r, 250));
    expect(server.net.requests.length).toBe(before); // no automatic retries, no polling

    server.net.status = null;
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText(/^Synced/)).toBeInTheDocument();
  });

  it('pauses with advice, instead of retrying forever, when the journal is too big for the server', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await renderApp();
    await turnOnSync(user);

    server.net.status = 413;
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect((await screen.findAllByText(/Sync is paused\. The journal is too big for the sync server/)).length).toBeGreaterThan(0);
    const before = server.net.requests.length;
    await new Promise((r) => setTimeout(r, 300));
    expect(server.net.requests.length).toBe(before);
  });

  it('does not turn sync back on if it was switched off while a sync was running', async () => {
    const user = userEvent.setup();
    const server = startServer();
    await renderApp();
    await turnOnSync(user);

    // Hold the next upload so sync can be switched off while it is running.
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let uploading = false;
    const fast = server.fetchImpl;
    vi.stubGlobal('fetch', async (url, init) => {
      if (init?.method === 'PUT') {
        uploading = true;
        await gate;
      }
      return fast(url, init);
    });

    await user.click(screen.getByRole('button', { name: 'Add test entry' })); // a change to upload
    await waitFor(() => expect(uploading).toBe(true), { timeout: 4000 });
    await user.click(screen.getByRole('button', { name: 'Stop syncing on this device' }));
    release();
    await new Promise((r) => setTimeout(r, 300));

    expect(await loadSetting('sync')).toBeNull();
    expect(screen.getByRole('button', { name: 'Turn on sync' })).toBeInTheDocument();
    expect((await loadEntries()).map((e) => e.content)).toEqual(['Written offline']); // the entry is still here
  });

  it('lists entries edited on two devices in Sync settings, with a link', async () => {
    const user = userEvent.setup();
    startServer();
    await seedEntries([
      { id: 1, content: 'Needs a look', date: '2026-10-01T10:00', updatedAt: 1000, conflict: { at: 1, otherSavedAt: 900 } },
      { id: 2, content: 'Fine', date: '2026-10-02T10:00', updatedAt: 1000 },
    ]);
    await renderApp();
    await turnOnSync(user);
    const section = screen.getByText(/One entry was edited on two devices/).closest('div');
    expect(within(section).getByRole('link', { name: /Needs a look/ })).toHaveAttribute('href', '/entry/1');
    expect(within(section).queryByText('Fine')).not.toBeInTheDocument();
  });
});
