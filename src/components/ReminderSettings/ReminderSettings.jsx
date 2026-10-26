import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { getPushPublicKey, removeReminder, saveReminder } from '../../lib/syncClient.js';
import styles from '../SyncSettings/SyncSettings.module.css';

const STORAGE_KEY = 'weatherJournalReminder';

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function writeSaved(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function keyBytes(base64url) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// A real notification at a chosen time each day, even with the app closed.
// Needs sync (the server knows which device to remind by its journal), and
// the push carries no text: the notification wording lives in the app.
export function ReminderSettings() {
  const { sync } = useEntriesContext();
  const [saved, setSaved] = useState(readSaved);
  const [time, setTime] = useState(saved?.time || '20:30');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!sync.enabled) {
    return <p className={styles.text}>Turn on sync first: reminders are sent by the sync server.</p>;
  }
  if (!pushSupported()) {
    return <p className={styles.text}>This browser can&apos;t show reminders from the app. On iPhone, add the app to your Home Screen first.</p>;
  }

  async function handleEnable(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them to get reminders.');
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(await getPushPublicKey()),
        }));
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await saveReminder(sync.code, { subscription: subscription.toJSON(), time, timeZone });
      const value = { time };
      writeSaved(value);
      setSaved(value);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function handleDisable() {
    setBusy(true);
    setError('');
    try {
      await removeReminder(sync.code);
      const registration = await navigator.serviceWorker.ready;
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      writeSaved(null);
      setSaved(null);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className={styles.sync}>
      {saved && (
        <p className={styles.status} role="status">
          On · every day at {saved.time}
        </p>
      )}
      <form className={styles.row} onSubmit={handleEnable}>
        <label className={styles.field}>
          Remind me at
          <input className={styles.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <Button type="submit" disabled={busy}>
          {saved ? 'Update reminder' : 'Turn on daily reminder'}
        </Button>
        {saved && (
          <Button type="button" variant="secondary" disabled={busy} onClick={handleDisable}>
            Turn off
          </Button>
        )}
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
