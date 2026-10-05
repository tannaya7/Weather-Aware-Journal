import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../../src/components/AppLayout/AppLayout.jsx';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { Settings } from '../../src/pages/Settings.jsx';
import { AUTO_LOCK_AFTER_MS } from '../../src/context/EntriesContext.jsx';
import { getLockInfo, loadEntries, setPasscode } from '../../src/lib/storage.js';
import { rawRecords, renderWithJournal, seedEntries, waitForJournal } from '../helpers/journal.jsx';

function renderApp(path = '/') {
  return renderWithJournal(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>,
    { initialEntries: [path] },
  );
}

async function unlockWith(user, passcode) {
  await user.type(await screen.findByLabelText('Passcode'), passcode);
  await user.click(screen.getByRole('button', { name: 'Unlock' }));
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('Passcode lock', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setVisibility('visible');
  });

  it('turns on from Settings, encrypting existing entries', async () => {
    const user = userEvent.setup();
    await seedEntries([{ id: 1, content: 'My secret day', date: '2026-10-01T10:00' }]);
    await renderApp('/settings');

    await user.type(screen.getByLabelText('New passcode'), '2468');
    await user.type(screen.getByLabelText('Repeat passcode'), '2468');
    await user.click(screen.getByRole('button', { name: 'Turn on passcode lock' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Passcode lock is on');
    expect(await getLockInfo()).not.toBeNull();
    expect(JSON.stringify(await rawRecords())).not.toContain('secret');
    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument();
  });

  it('checks the new passcode before turning the lock on', async () => {
    const user = userEvent.setup();
    await renderApp('/settings');

    await user.type(screen.getByLabelText('New passcode'), '12');
    await user.type(screen.getByLabelText('Repeat passcode'), '12');
    await user.click(screen.getByRole('button', { name: 'Turn on passcode lock' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 4 characters');

    await user.clear(screen.getByLabelText('New passcode'));
    await user.type(screen.getByLabelText('New passcode'), '123456');
    await user.click(screen.getByRole('button', { name: 'Turn on passcode lock' }));
    expect(screen.getByRole('alert')).toHaveTextContent("don't match");
    expect(await getLockInfo()).toBeNull();
  });

  it('opens locked, refuses a wrong passcode, and opens with the right one', async () => {
    const user = userEvent.setup();
    await setPasscode('2468', [{ id: 1, content: 'Behind the lock', date: '2026-10-01T10:00' }]);
    await renderApp();

    expect(screen.getByRole('heading', { name: 'Your journal is locked' })).toBeInTheDocument();
    expect(screen.queryByText('Behind the lock')).not.toBeInTheDocument();

    await unlockWith(user, '0000');
    expect(await screen.findByRole('alert')).toHaveTextContent("That passcode isn't right.");
    expect(screen.getByLabelText('Passcode')).toHaveValue('');

    await unlockWith(user, '2468');
    expect(await screen.findByText('Behind the lock')).toBeInTheDocument();
  });

  it('locks again from the sidebar', async () => {
    const user = userEvent.setup();
    await setPasscode('2468', [{ id: 1, content: 'Behind the lock', date: '2026-10-01T10:00' }]);
    await renderApp();
    await unlockWith(user, '2468');
    await screen.findByText('Behind the lock');

    await user.click(screen.getByRole('button', { name: 'Lock' }));

    expect(await screen.findByRole('heading', { name: 'Your journal is locked' })).toBeInTheDocument();
    expect(screen.queryByText('Behind the lock')).not.toBeInTheDocument();
  });

  it('locks after 5 minutes in the background, but not after a quick switch', async () => {
    const user = userEvent.setup();
    await setPasscode('2468', [{ id: 1, content: 'Behind the lock', date: '2026-10-01T10:00' }]);
    await renderApp();
    await unlockWith(user, '2468');
    await screen.findByText('Behind the lock');

    const start = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    act(() => setVisibility('hidden'));
    now.mockReturnValue(start + 60 * 1000);
    act(() => setVisibility('visible'));
    expect(screen.getByText('Behind the lock')).toBeInTheDocument();

    act(() => setVisibility('hidden'));
    now.mockReturnValue(start + 60 * 1000 + AUTO_LOCK_AFTER_MS);
    act(() => setVisibility('visible'));

    expect(await screen.findByRole('heading', { name: 'Your journal is locked' })).toBeInTheDocument();
  });

  it('changes the passcode, needing the current one', async () => {
    const user = userEvent.setup();
    await setPasscode('2468', []);
    await renderApp('/settings');
    await unlockWith(user, '2468');
    await screen.findByRole('heading', { name: /passcode lock/i });

    await user.type(screen.getByLabelText('Current passcode'), 'wrong');
    await user.type(screen.getByLabelText('New passcode'), '1357');
    await user.type(screen.getByLabelText('Repeat new passcode'), '1357');
    await user.click(screen.getByRole('button', { name: 'Change passcode' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("isn't right");

    await user.clear(screen.getByLabelText('Current passcode'));
    await user.type(screen.getByLabelText('Current passcode'), '2468');
    await user.click(screen.getByRole('button', { name: 'Change passcode' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Passcode changed.');
  });

  it('turns the lock off with the current passcode', async () => {
    const user = userEvent.setup();
    await setPasscode('2468', [{ id: 1, content: 'Back to plain', date: '2026-10-01T10:00' }]);
    await renderApp('/settings');
    await unlockWith(user, '2468');

    await user.type(await screen.findByLabelText('Current passcode'), '2468');
    await user.click(screen.getByRole('button', { name: 'Turn off lock' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Passcode lock is off');
    expect(await getLockInfo()).toBeNull();
    expect(await loadEntries()).toEqual([{ id: 1, content: 'Back to plain', date: '2026-10-01T10:00' }]);
    expect(screen.queryByRole('button', { name: 'Lock' })).not.toBeInTheDocument();
  });

  it('erases the journal for a forgotten passcode, only after typing ERASE', async () => {
    const user = userEvent.setup();
    await setPasscode('2468', [{ id: 1, content: 'Lost forever', date: '2026-10-01T10:00' }]);
    await renderApp();

    await user.click(await screen.findByRole('button', { name: 'Forgot your passcode?' }));
    const erase = screen.getByRole('button', { name: 'Erase journal' });
    expect(erase).toBeDisabled();

    await user.type(screen.getByLabelText('Type ERASE to confirm'), 'ERASE');
    await user.click(erase);
    await waitForJournal();

    expect(await screen.findByText('No entries yet.')).toBeInTheDocument();
    expect(await getLockInfo()).toBeNull();
    expect(await loadEntries()).toEqual([]);
  });
});
