import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../../src/components/AppLayout/AppLayout.jsx';
import { Settings } from '../../src/pages/Settings.jsx';
import { loadEntries } from '../../src/lib/storage.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

const KB = 1024;
const MB = 1024 * 1024;

function photo(bytes) {
  return `data:image/jpeg;base64,${btoa('x'.repeat(bytes))}`;
}

function setStorage(storage) {
  Object.defineProperty(navigator, 'storage', { value: storage, configurable: true });
}

function fakeStorage({ usage = 50 * MB, quota = 1000 * MB, persisted = false, persist } = {}) {
  const state = { persisted };
  return {
    estimate: async () => ({ usage, quota }),
    persisted: async () => state.persisted,
    persist: persist || (async () => (state.persisted = true)),
  };
}

function renderApp(path = '/settings') {
  return renderWithJournal(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>,
    { initialEntries: [path] },
  );
}

// jsdom cannot decode or draw images, so stand in for the browser: any photo
// becomes a tiny one. `gate` lets a test hold a photo mid-way.
function stubImageApis({ gate } = {}) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (gate) await gate;
      return { width: 4000, height: 3000, close() {} };
    }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(photo(10 * KB));
}

const section = () => screen.getByRole('region', { name: 'Storage' });

describe('Storage settings', () => {
  beforeEach(() => {
    localStorage.clear();
    setStorage(fakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setStorage(undefined);
  });

  it('shows how much of the quota is used and what the journal is made of', async () => {
    await seedEntries([
      { id: 1, content: 'hello', date: '2026-10-01T10:00', images: [photo(300 * KB), photo(50 * KB)] },
      { id: 2, content: 'memo', date: '2026-10-02T10:00', audio: [{ src: 'data:audio/webm;base64,' + btoa('a'.repeat(2000)) }] },
    ]);
    await renderApp();
    expect(await within(section()).findByText(/using 50 MB of the 1000 MB the browser allows \(5%\)/i)).toBeInTheDocument();
    expect(within(section()).getByRole('progressbar', { name: 'Storage used on this device' })).toHaveAttribute('value', '5');
    expect(within(section()).getByText(/2 photos \(350 KB\)/)).toBeInTheDocument();
    expect(within(section()).getByText(/1 voice memo \(2\.0 KB\)/)).toBeInTheDocument();
  });

  it('says so when the browser cannot report space', async () => {
    setStorage(undefined);
    await renderApp();
    expect(await within(section()).findByText(/does not say how much space is left/)).toBeInTheDocument();
  });

  it('warns when space is getting full', async () => {
    setStorage(fakeStorage({ usage: 900 * MB, quota: 1000 * MB }));
    await renderApp();
    expect(await within(section()).findByText(/That is getting full/)).toBeInTheDocument();
  });

  it('offers to protect the journal from being cleared, and reports the answer', async () => {
    const user = userEvent.setup();
    // The app asks once when it opens (and is refused); the button asks again.
    const state = { persisted: false, asked: 0 };
    setStorage({
      estimate: async () => ({ usage: 50 * MB, quota: 1000 * MB }),
      persisted: async () => state.persisted,
      persist: async () => {
        state.asked += 1;
        if (state.asked === 1) return false;
        state.persisted = true;
        return true;
      },
    });
    await renderApp();
    expect(await within(section()).findByText(/Not protected/)).toBeInTheDocument();
    await user.click(within(section()).getByRole('button', { name: 'Ask the browser to protect it' }));
    expect(await within(section()).findByText(/Done\. The browser will keep this journal/)).toBeInTheDocument();
    await waitFor(() => expect(within(section()).getByText(/^Protected:/)).toBeInTheDocument());
    expect(within(section()).queryByRole('button', { name: 'Ask the browser to protect it' })).not.toBeInTheDocument();
  });

  it('says plainly when the browser declines to protect it', async () => {
    const user = userEvent.setup();
    setStorage(fakeStorage({ persist: async () => false }));
    await renderApp();
    await user.click(await within(section()).findByRole('button', { name: 'Ask the browser to protect it' }));
    expect(await within(section()).findByText(/did not agree this time/)).toBeInTheDocument();
    expect(within(section()).getByText(/Not protected/)).toBeInTheDocument();
  });

  it('has nothing to shrink when photos are already small', async () => {
    await seedEntries([{ id: 1, content: 'x', date: '2026-10-01T10:00', images: [photo(20 * KB)] }]);
    await renderApp();
    expect(await within(section()).findByText(/already a good size/)).toBeInTheDocument();
    expect(within(section()).queryByRole('button', { name: /smaller/ })).not.toBeInTheDocument();
  });

  it('asks before shrinking, then replaces big photos with smaller copies', async () => {
    const user = userEvent.setup();
    stubImageApis();
    await seedEntries([
      { id: 1, content: 'a', date: '2026-10-01T10:00', images: [photo(400 * KB), photo(30 * KB)], updatedAt: 1000 },
      { id: 2, content: 'b', date: '2026-10-02T10:00', images: [photo(500 * KB)], updatedAt: 1000 },
    ]);
    await renderApp();

    await user.click(await within(section()).findByRole('button', { name: 'Make 2 photos smaller…' }));
    expect(within(section()).getByText(/originals cannot be brought back/)).toBeInTheDocument();
    // Nothing has changed yet, and cancelling leaves it that way.
    await user.click(within(section()).getByRole('button', { name: 'Cancel' }));
    expect((await loadEntries())[0].images[0].length).toBeGreaterThan(400 * KB);
    expect(within(section()).queryByText(/originals cannot be brought back/)).not.toBeInTheDocument();

    await user.click(within(section()).getByRole('button', { name: 'Make 2 photos smaller…' }));
    await user.click(within(section()).getByRole('button', { name: 'Yes, make them smaller' }));

    expect(await within(section()).findByText(/Done\. 2 photos made smaller, 8\d\d KB saved\./, {}, { timeout: 5000 })).toBeInTheDocument();
    const saved = await loadEntries();
    const byId = Object.fromEntries(saved.map((e) => [e.id, e]));
    expect(byId[1].images).toHaveLength(2);
    expect(byId[1].images[0]).toBe(photo(10 * KB));
    expect(byId[1].images[1]).toBe(photo(30 * KB)); // the small one was left alone
    expect(byId[2].images).toEqual([photo(10 * KB)]);
    expect(byId[1].updatedAt).toBeGreaterThan(1000); // so sync carries it to other devices
    expect(byId[1].history).toBeUndefined(); // photos are not "writing"
  });

  it('can be stopped part-way, keeping what was finished', async () => {
    const user = userEvent.setup();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    stubImageApis({ gate });
    await seedEntries([
      { id: 1, content: 'a', date: '2026-10-01T10:00', images: [photo(400 * KB)], updatedAt: 1000 },
      { id: 2, content: 'b', date: '2026-10-02T10:00', images: [photo(500 * KB)], updatedAt: 1000 },
    ]);
    await renderApp();
    await user.click(await within(section()).findByRole('button', { name: 'Make 2 photos smaller…' }));
    await user.click(within(section()).getByRole('button', { name: 'Yes, make them smaller' }));

    const stop = await within(section()).findByRole('button', { name: 'Stop' });
    expect(within(section()).getByRole('progressbar', { name: 'Making photos smaller' })).toBeInTheDocument();
    await user.click(stop);
    release();

    expect(await within(section()).findByText(/Stopped\. 1 photo made smaller/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(within(section()).getByText(/carry on later/)).toBeInTheDocument();
    const saved = Object.fromEntries((await loadEntries()).map((e) => [e.id, e]));
    expect(saved[1].images[0]).toBe(photo(10 * KB));
    expect(saved[2].images[0].length).toBeGreaterThan(400 * KB); // untouched
    // The leftover photo can still be shrunk later.
    expect(within(section()).getByRole('button', { name: 'Make 1 photo smaller…' })).toBeInTheDocument();
  });

  it('explains when the browser could not shrink anything', async () => {
    const user = userEvent.setup();
    // No createImageBitmap in this test browser: every photo is kept as is.
    await seedEntries([{ id: 1, content: 'a', date: '2026-10-01T10:00', images: [photo(400 * KB)] }]);
    await renderApp();
    await user.click(await within(section()).findByRole('button', { name: 'Make 1 photo smaller…' }));
    await user.click(within(section()).getByRole('button', { name: 'Yes, make them smaller' }));
    expect(await within(section()).findByText(/could not make the rest any smaller/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect((await loadEntries())[0].images[0]).toBe(photo(400 * KB));
  });
});

describe('Low-space notice', () => {
  afterEach(() => setStorage(undefined));

  it('stays out of the way when there is plenty of room', async () => {
    setStorage(fakeStorage({ usage: 10 * MB, quota: 1000 * MB }));
    await renderApp();
    await waitFor(() => expect(navigator.storage.estimate).toBeDefined());
    expect(screen.queryByText(/getting low|almost out of space/)).not.toBeInTheDocument();
  });

  it('appears across the top as space runs low, with a way to the details', async () => {
    setStorage(fakeStorage({ usage: 850 * MB, quota: 1000 * MB }));
    await renderApp();
    expect(await screen.findByText(/Space for the journal is getting low \(850 MB of 1000 MB\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what is using it' })).toHaveAttribute('href', '/settings');
  });

  it('is stronger when nearly out', async () => {
    setStorage(fakeStorage({ usage: 970 * MB, quota: 1000 * MB }));
    await renderApp();
    expect(await screen.findByText(/almost out of space for the journal/)).toBeInTheDocument();
    expect(document.querySelector('[data-level="critical"]')).toBeInTheDocument();
  });

  it('shows nothing when the browser cannot report space', async () => {
    setStorage(undefined);
    await renderApp();
    expect(screen.queryByRole('link', { name: 'See what is using it' })).not.toBeInTheDocument();
  });
});
