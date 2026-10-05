import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../Button/Button.jsx';
import { isSameDay } from '../../lib/dateFormat.js';
import styles from './ReminderBanner.module.css';

const DISMISSED_KEY = 'weatherJournalReminderDismissed';
const REMIND_FROM_HOUR = 18;

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Storage can be unavailable (private mode, blocked site data); the banner
// then just can't remember a dismissal past this page view.
function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(value) {
  try {
    localStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // ignore — see readDismissed
  }
}

// An in-app nudge, since real notifications would need a server: shown in
// the evening on days with no entry yet, and dismissible for the day.
export function ReminderBanner({ entries, now = new Date() }) {
  const navigate = useNavigate();
  const today = dayKey(now);
  const [dismissed, setDismissed] = useState(() => readDismissed() === today);

  const wroteToday = entries.some((entry) => isSameDay(entry.date, now));
  if (dismissed || wroteToday || now.getHours() < REMIND_FROM_HOUR) return null;

  function handleDismiss() {
    writeDismissed(today);
    setDismissed(true);
  }

  return (
    <aside className={styles.banner} aria-label="Writing reminder">
      <span className={styles.icon} aria-hidden="true">
        🌙
      </span>
      <p className={styles.text}>You haven&apos;t written today. How was it?</p>
      <Button type="button" small onClick={() => navigate('/new')}>
        Write now
      </Button>
      <button
        type="button"
        className={styles.dismiss}
        onClick={handleDismiss}
        aria-label="Dismiss reminder for today"
        title="Dismiss for today"
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}
