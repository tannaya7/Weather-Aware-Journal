import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../../src/components/AppLayout/AppLayout.jsx';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { Settings } from '../../src/pages/Settings.jsx';
import { ExportPage } from '../../src/pages/ExportPage.jsx';
import { loadEntries, setPasscode } from '../../src/lib/storage.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function renderApp(path) {
  return renderWithJournal(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/export" element={<ExportPage />} />
      </Route>
    </Routes>,
    { initialEntries: [path] },
  );
}

// A fake platform authenticator: one passkey, a fixed PRF secret, and a
// switch for "the person cancelled the fingerprint prompt".
function fakeAuthenticator() {
  const secret = new Uint8Array(32).fill(42).buffer;
  const state = { cancel: false };
  const result = () => ({
    rawId: new Uint8Array([5, 5, 5]).buffer,
    getClientExtensionResults: () => ({ prf: { enabled: true, results: { first: secret } } }),
  });
  const reject = () => Promise.reject(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
  vi.stubGlobal('PublicKeyCredential', { getClientCapabilities: async () => ({ 'extension:prf': true }) });
  vi.stubGlobal('navigator', {
    ...navigator,
    credentials: {
      create: vi.fn(async () => result()),
      get: vi.fn(() => (state.cancel ? reject() : Promise.resolve(result()))),
    },
  });
  return state;
}

describe('Fingerprint or face unlock', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets up from Settings, then unlocks without the passcode', async () => {
    const user = userEvent.setup();
    const authenticator = fakeAuthenticator();
    await setPasscode('2468', [{ id: 1, content: 'Behind the passkey', date: '2026-10-01T10:00' }]);

    const first = await renderApp('/settings');
    await user.type(screen.getByLabelText('Passcode'), '2468');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await user.type(await screen.findByLabelText('Current passcode', { selector: '#passkeyPasscode' }), '2468');
    await user.click(screen.getByRole('button', { name: 'Set up fingerprint or face unlock' }));
    expect(await screen.findByText('Fingerprint or face unlock is on.')).toBeInTheDocument();
    first.unmount();

    // Next visit: the lock screen offers the passkey first.
    await renderApp('/');
    authenticator.cancel = true;
    await user.click(screen.getByRole('button', { name: /unlock with fingerprint or face/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled or timed out/);

    authenticator.cancel = false;
    await user.click(screen.getByRole('button', { name: /unlock with fingerprint or face/i }));
    expect(await screen.findByText('Behind the passkey')).toBeInTheDocument();
  });

  it('needs the right passcode to set it up', async () => {
    const user = userEvent.setup();
    fakeAuthenticator();
    await setPasscode('2468', []);
    await renderApp('/settings');
    await user.type(screen.getByLabelText('Passcode'), '2468');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await user.type(await screen.findByLabelText('Current passcode', { selector: '#passkeyPasscode' }), '0000');
    await user.click(screen.getByRole('button', { name: 'Set up fingerprint or face unlock' }));

    expect(await screen.findByText("That passcode isn't right.")).toBeInTheDocument();
    expect(navigator.credentials.create).not.toHaveBeenCalled();
  });

  it('is not offered where passkeys cannot unlock the journal', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('PublicKeyCredential', { getClientCapabilities: async () => ({ 'extension:prf': false }) });
    await setPasscode('2468', []);
    await renderApp('/settings');
    await user.type(screen.getByLabelText('Passcode'), '2468');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByText(/can't unlock the journal with a passkey/i)).toBeInTheDocument();
  });
});

describe('Encrypted backups (Export page)', () => {
  let downloaded;

  beforeEach(() => {
    localStorage.clear();
    downloaded = null;
    URL.createObjectURL = vi.fn((blob) => {
      downloaded = blob;
      return 'blob:backup';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function makeBackup(user, password) {
    await user.type(screen.getAllByLabelText('Backup password')[0], password);
    await user.type(screen.getByLabelText('Repeat password'), password);
    await user.click(screen.getByRole('button', { name: 'Download backup' }));
    await screen.findByText(/backup of 2 entries downloaded/i);
    // jsdom's Blob has no .text(); read it the older way.
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(downloaded);
    });
  }

  // Several deliberately slow PBKDF2 derivations, so more than the default 5s.
  it('downloads a backup and restores it into an empty journal', { timeout: 30000 }, async () => {
    const user = userEvent.setup();
    await seedEntries([
      { id: 1, content: 'Keep me safe', date: '2026-01-01T10:00' },
      { id: 2, content: 'Me too', date: '2026-01-02T10:00' },
    ]);
    const first = await renderApp('/export');
    const backupText = await makeBackup(user, 'correct horse battery');
    expect(backupText).not.toContain('Keep me safe');
    first.unmount();

    // A new, empty journal (e.g. a new phone).
    globalThis.indexedDB = new IDBFactory();
    await renderApp('/export');
    const file = new File([backupText], 'weather-journal-backup.wjbackup', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Backup file'), file);

    await user.type(screen.getAllByLabelText('Backup password')[1], 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That password doesn't open this backup.");

    await user.clear(screen.getAllByLabelText('Backup password')[1]);
    await user.type(screen.getAllByLabelText('Backup password')[1], 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('Restored 2 entries.')).toBeInTheDocument();
    await waitFor(async () => expect((await loadEntries()).map((e) => e.content)).toEqual(['Keep me safe', 'Me too']));
  });

  it('checks the backup password before encrypting', async () => {
    const user = userEvent.setup();
    await seedEntries([{ id: 1, content: 'x', date: '2026-01-01T10:00' }]);
    await renderApp('/export');

    await user.type(screen.getAllByLabelText('Backup password')[0], 'short');
    await user.type(screen.getByLabelText('Repeat password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Download backup' }));

    expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(downloaded).toBeNull();
  });
});
