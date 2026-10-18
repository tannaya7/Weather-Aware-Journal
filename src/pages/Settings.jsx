import { useEffect, useState } from 'react';
import { Header } from '../components/Header/Header.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { Button } from '../components/Button/Button.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { useAnnouncer } from '../context/AnnouncerContext.jsx';
import { WeatherBackfill } from '../components/WeatherBackfill/WeatherBackfill.jsx';
import { HabitSettings } from '../components/HabitSettings/HabitSettings.jsx';
import { isPasskeySupported, passkeyErrorMessage } from '../lib/passkey.js';
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

// Fingerprint / face unlock, on top of the passcode (never instead of it:
// the passcode is the fallback when the passkey isn't available).
function PasskeySection({ onDone }) {
  const { passkeyEnabled, enablePasskey, disablePasskey } = useEntriesContext();
  const [supported, setSupported] = useState(null);
  const [current, setCurrent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isPasskeySupported().then((ok) => !cancelled && setSupported(ok));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await enablePasskey(current);
      setCurrent('');
      onDone('Fingerprint or face unlock is on.');
    } catch (err) {
      setError(err.name === 'WrongPasscodeError' ? err.message : passkeyErrorMessage(err));
    }
    setBusy(false);
  }

  async function handleDisable() {
    setBusy(true);
    await disablePasskey();
    setBusy(false);
    onDone('Fingerprint or face unlock is off. Use your passcode to unlock.');
  }

  return (
    <div className={styles.subsection}>
      <h3 className={styles.subheading}>
        Fingerprint or face unlock {passkeyEnabled ? <span className={styles.badge}>On</span> : null}
      </h3>
      {passkeyEnabled ? (
        <>
          <p className={styles.text}>
            Unlock with this device&apos;s fingerprint, face, or PIN. Your passcode still works too.
          </p>
          <Button type="button" variant="secondary" disabled={busy} onClick={handleDisable}>
            Turn off fingerprint or face unlock
          </Button>
        </>
      ) : supported === false ? (
        <p className={styles.text}>This browser or device can&apos;t unlock the journal with a passkey.</p>
      ) : (
        <form onSubmit={handleEnable} noValidate className={styles.form}>
          <p className={styles.text}>
            Creates a passkey on this device. Unlocking then only needs your fingerprint, face, or
            device PIN.
          </p>
          <PasscodeField
            id="passkeyPasscode"
            label="Current passcode"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !current || supported === null}>
            Set up fingerprint or face unlock
          </Button>
        </form>
      )}
    </div>
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
            <>
              <ManageLockForm key="manage" onDone={handleDone} />
              <PasskeySection onDone={handleDone} />
            </>
          ) : (
            <EnableLockForm key="enable" onDone={handleDone} />
          )}
        </section>

        <section className={styles.card} aria-labelledby="habits-heading">
          <h2 id="habits-heading" className={styles.heading}>
            Habits
          </h2>
          <HabitSettings />
        </section>

        <section className={styles.card} aria-labelledby="backfill-heading">
          <h2 id="backfill-heading" className={styles.heading}>
            Fill in missing weather
          </h2>
          <WeatherBackfill />
        </section>
      </div>
    </>
  );
}
