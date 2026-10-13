import { useState } from 'react';
import { Header } from '../components/Header/Header.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { Button } from '../components/Button/Button.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { useAnnouncer } from '../context/AnnouncerContext.jsx';
import styles from './Settings.module.css';

export const MIN_PASSCODE_LENGTH = 4;

function PasscodeField({ id, label, value, onChange, autoComplete = 'new-password' }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="password"
        className={styles.input}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function validateNew(passcode, confirm) {
  if (passcode.length < MIN_PASSCODE_LENGTH) {
    return `Use at least ${MIN_PASSCODE_LENGTH} characters.`;
  }
  if (passcode !== confirm) return "The two passcodes don't match.";
  return '';
}

// Turns the lock on: entries are encrypted with a key derived from the
// passcode (see lib/crypto.js).
function EnableLockForm({ onDone }) {
  const { enableLock } = useEntriesContext();
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const problem = validateNew(passcode, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await enableLock(passcode);
      onDone('Passcode lock is on. Your entries are now encrypted.');
    } catch (err) {
      setError(err.message || 'Could not turn on the lock.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <PasscodeField id="newPasscode" label="New passcode" value={passcode} onChange={setPasscode} />
      <PasscodeField id="confirmPasscode" label="Repeat passcode" value={confirm} onChange={setConfirm} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Encrypting…' : 'Turn on passcode lock'}
      </Button>
    </form>
  );
}

function ManageLockForm({ onDone }) {
  const { changePasscode, disableLock } = useEntriesContext();
  const [current, setCurrent] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action, message) {
    setBusy(true);
    setError('');
    try {
      await action();
      onDone(message);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setBusy(false);
    }
  }

  function handleChange(e) {
    e.preventDefault();
    const problem = validateNew(passcode, confirm);
    if (problem) return setError(problem);
    run(() => changePasscode(current, passcode), 'Passcode changed.');
  }

  function handleDisable() {
    run(() => disableLock(current), 'Passcode lock is off. Entries are no longer encrypted.');
  }

  return (
    <form onSubmit={handleChange} noValidate className={styles.form}>
      <PasscodeField
        id="currentPasscode"
        label="Current passcode"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <PasscodeField id="newPasscode" label="New passcode" value={passcode} onChange={setPasscode} />
      <PasscodeField id="confirmPasscode" label="Repeat new passcode" value={confirm} onChange={setConfirm} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" disabled={busy || !current}>
          Change passcode
        </Button>
        <Button type="button" variant="secondary" disabled={busy || !current} onClick={handleDisable}>
          Turn off lock
        </Button>
      </div>
    </form>
  );
}

export function Settings() {
  const { lockEnabled } = useEntriesContext();
  const { announce } = useAnnouncer();
  const [message, setMessage] = useState('');

  function handleDone(text) {
    setMessage(text);
    announce(text, 'assertive');
  }

  return (
    <>
      <Header title="Settings" icon="⚙️">
        <ThemeToggle />
      </Header>

      <div className={`container ${styles.page}`} id="main-content" role="main">
        <section className={styles.card} aria-labelledby="lock-heading">
          <h2 id="lock-heading" className={styles.heading}>
            Passcode lock {lockEnabled ? <span className={styles.badge}>On</span> : null}
          </h2>
          <p className={styles.text}>
            Encrypts every entry on this device and asks for your passcode when you open the
            journal. It locks again after 5 minutes in the background.
          </p>
          <p className={styles.warning}>
            <strong>There is no way to recover a forgotten passcode.</strong> Your entries can
            only be decrypted with it. Exports are not encrypted, so keep backup files somewhere
            safe.
          </p>

          {message && (
            <p className={styles.success} role="status">
              {message}
            </p>
          )}

          {lockEnabled ? (
            <ManageLockForm key="manage" onDone={handleDone} />
          ) : (
            <EnableLockForm key="enable" onDone={handleDone} />
          )}
        </section>
      </div>
    </>
  );
}
