import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import styles from './LockScreen.module.css';

const ERASE_CONFIRM = 'ERASE';

// Shown instead of the app while the journal is locked. A wrong passcode
// can't be recovered from, so the only way out of a forgotten one is to
// erase the journal — which takes typing ERASE to confirm.
export function LockScreen({ onUnlock, onErase }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showErase, setShowErase] = useState(false);
  const [eraseText, setEraseText] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!passcode) return;
    setBusy(true);
    setError('');
    try {
      await onUnlock(passcode);
    } catch (err) {
      setError(err.name === 'WrongPasscodeError' ? err.message : 'Something went wrong. Try again.');
      setPasscode('');
      setBusy(false);
    }
  }

  return (
    <div className={styles.screen} role="main" id="main-content">
      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <span className={styles.icon} aria-hidden="true">
          🔒
        </span>
        <h1 className={styles.title}>Your journal is locked</h1>

        <label className="sr-only" htmlFor="unlockPasscode">
          Passcode
        </label>
        <input
          id="unlockPasscode"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          placeholder="Passcode"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the lock screen's only job
          autoFocus
          value={passcode}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'unlockError' : undefined}
          onChange={(e) => setPasscode(e.target.value)}
        />
        {error && (
          <p id="unlockError" className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !passcode}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>

        {!showErase ? (
          <button type="button" className={styles.link} onClick={() => setShowErase(true)}>
            Forgot your passcode?
          </button>
        ) : (
          <div className={styles.erase}>
            <p>
              Your entries are encrypted with your passcode, so without it they can&apos;t be
              recovered. You can erase the journal and start over. <strong>This deletes every
              entry on this device.</strong>
            </p>
            <label htmlFor="eraseConfirm">Type {ERASE_CONFIRM} to confirm</label>
            <input
              id="eraseConfirm"
              className={styles.input}
              value={eraseText}
              autoComplete="off"
              onChange={(e) => setEraseText(e.target.value)}
            />
            <div className={styles.eraseActions}>
              <Button
                type="button"
                variant="danger"
                disabled={eraseText !== ERASE_CONFIRM}
                onClick={onErase}
              >
                Erase journal
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowErase(false);
                  setEraseText('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
