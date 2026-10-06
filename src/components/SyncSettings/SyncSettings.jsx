import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { formatSyncCode, getServerUrl, setServerUrl } from '../../lib/syncClient.js';
import styles from './SyncSettings.module.css';

function when(timestamp) {
  return new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function ServerAddress({ onSaved }) {
  const [url, setUrl] = useState(getServerUrl());
  return (
    <form
      className={styles.row}
      onSubmit={(e) => {
        e.preventDefault();
        setServerUrl(url);
        onSaved();
      }}
    >
      <label className={styles.field}>
        Server address
        <input
          className={styles.input}
          type="url"
          placeholder="https://weather-journal-server.example.workers.dev"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <Button type="submit" variant="secondary" small>
        Save
      </Button>
    </form>
  );
}

// Encrypted sync between your devices. The sync code is the only thing
// that connects them, so it's shown on demand and explained plainly.
export function SyncSettings() {
  const { sync } = useEntriesContext();
  const [, refresh] = useState(0);
  const [showCode, setShowCode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action, done) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      if (done) setMessage(done);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  if (!getServerUrl()) {
    return (
      <div className={styles.sync}>
        <p className={styles.text}>
          Sync keeps this journal the same on your phone and computer, end-to-end encrypted. It needs
          the Weather Journal server (see the project&apos;s <code>worker/</code> folder). Enter its
          address to turn sync on.
        </p>
        <ServerAddress onSaved={() => refresh((n) => n + 1)} />
      </div>
    );
  }

  if (!sync.enabled) {
    return (
      <div className={styles.sync}>
        <p className={styles.text}>
          Keep this journal the same on all your devices. Everything is encrypted on this device
          before it&apos;s sent: the server stores only data it can&apos;t read.
        </p>
        <Button type="button" disabled={busy} onClick={() => run(sync.enableSync, 'Sync is on.')}>
          Turn on sync
        </Button>

        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            run(() => sync.joinSync(joinCode), 'Joined. Your devices now share one journal.');
          }}
        >
          <label className={styles.field}>
            Already syncing on another device? Enter its sync code
            <input
              className={styles.input}
              value={joinCode}
              autoComplete="off"
              spellCheck="false"
              onChange={(e) => setJoinCode(e.target.value)}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={busy || !joinCode.trim()}>
            Join
          </Button>
        </form>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className={styles.success} role="status">
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.sync}>
      <p className={styles.status} role="status">
        {sync.status === 'syncing'
          ? 'Syncing…'
          : sync.status === 'error'
            ? `Sync problem: ${sync.error}`
            : sync.lastSyncedAt
              ? `Synced · last ${when(sync.lastSyncedAt)}`
              : 'Not synced yet'}
      </p>
      {message && <p className={styles.success}>{message}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button type="button" variant="secondary" small disabled={busy || sync.status === 'syncing'} onClick={sync.syncNow}>
          Sync now
        </Button>
        <Button type="button" variant="secondary" small onClick={() => setShowCode((v) => !v)}>
          {showCode ? 'Hide sync code' : 'Show sync code'}
        </Button>
      </div>

      {showCode && (
        <div className={styles.code}>
          <p className={styles.text}>
            Enter this on another device under Settings → Sync → <em>Join</em>. Anyone with this code
            can read and change your journal, so keep it private.
          </p>
          <code className={styles.codeText}>{formatSyncCode(sync.code)}</code>
          <Button
            type="button"
            small
            variant="secondary"
            onClick={() => navigator.clipboard?.writeText(sync.code).then(() => setMessage('Sync code copied.'))}
          >
            Copy
          </Button>
        </div>
      )}

      <div className={styles.danger}>
        <Button type="button" variant="secondary" small disabled={busy} onClick={() => run(() => sync.disableSync(), 'Sync is off on this device. Your entries here are kept.')}>
          Stop syncing on this device
        </Button>
        {!confirmDelete ? (
          <button type="button" className={styles.link} onClick={() => setConfirmDelete(true)}>
            Delete the synced copy from the server…
          </button>
        ) : (
          <div className={styles.confirm}>
            <p>
              This removes the journal from the server for <strong>all</strong> devices. Entries on
              each device stay where they are.
            </p>
            <Button
              type="button"
              variant="danger"
              small
              disabled={busy}
              onClick={() => run(() => sync.disableSync({ deleteFromServer: true }), 'The server copy is deleted.')}
            >
              Delete from server
            </Button>
            <Button type="button" variant="secondary" small onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
