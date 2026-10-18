import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { requestReflection } from '../../lib/syncClient.js';
import { stripMarkdown } from '../../lib/richText.js';
import { allHabits } from '../../lib/habits.js';
import styles from './Reflection.module.css';

const WEEK_MS = 7 * 86400000;

// What's sent for each entry: text, date, mood, weather, and habits. Never
// photos, voice memos, location, or tags.
function toReflectionEntry(entry, habits) {
  const habitText = habits
    .filter((h) => entry.habits?.[h.id] !== undefined)
    .map((h) => (h.type === 'boolean' ? `${h.name}: ${entry.habits[h.id] ? 'yes' : 'no'}` : `${h.name}: ${entry.habits[h.id]} ${h.unit}`))
    .join(', ');
  return {
    date: entry.date ? new Date(entry.date).toDateString() : '',
    mood: entry.mood || '',
    weather: [entry.weatherType, entry.temperature].filter(Boolean).join(', '),
    habits: habitText,
    text: stripMarkdown(entry.content),
  };
}

function recentEntries(entries, now = Date.now()) {
  return entries.filter((e) => e.date && now - new Date(e.date) <= WEEK_MS && now >= new Date(e.date));
}

// AI reflection on the past week (Insights) or one entry (entry page).
// Off until the person opts in, which spells out what leaves the device.
export function Reflection({ scope, entry }) {
  const { entries, sync, settings, setSetting, habitConfig } = useEntriesContext();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const optedIn = Boolean(settings.ai?.enabled);

  const chosen = scope === 'entry' ? [entry] : recentEntries(entries);
  const label = scope === 'entry' ? 'Reflect on this entry' : 'Reflect on the past 7 days';

  if (!sync.enabled) {
    return (
      <p className={styles.text}>
        AI reflections run on the sync server. Turn on sync in Settings to use them.
      </p>
    );
  }

  if (!optedIn) {
    return (
      <div className={styles.optIn}>
        <p className={styles.text}>
          Get a short, private reflection on your entries from Claude (an AI by Anthropic). When you
          ask for one, the <strong>text, date, mood, weather, and habits</strong> of those entries are
          sent to the AI. Photos, voice memos, places, and tags never are. Nothing is sent until you
          press the button.
        </p>
        <Button type="button" variant="secondary" small onClick={() => setSetting('ai', { enabled: true })}>
          Turn on AI reflections
        </Button>
      </div>
    );
  }

  async function handleReflect() {
    setBusy(true);
    setError('');
    try {
      const habits = allHabits(habitConfig);
      const reply = await requestReflection(sync.code, {
        scope,
        entries: chosen.map((e) => toReflectionEntry(e, habits)),
      });
      setResult(reply);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className={styles.reflection}>
      <div className={styles.actions}>
        <Button type="button" small disabled={busy || chosen.length === 0} onClick={handleReflect}>
          {busy ? 'Thinking…' : `✨ ${label}`}
        </Button>
        {chosen.length === 0 && <span className={styles.text}>No entries in the past 7 days yet.</span>}
        <button type="button" className={styles.link} onClick={() => setSetting('ai', { enabled: false })}>
          Turn off AI reflections
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {result && (
        <figure className={styles.result}>
          <blockquote className={styles.quote}>{result.text}</blockquote>
          <figcaption className={styles.caption}>
            By Claude · AI can be wrong; this isn&apos;t professional advice
            {typeof result.remainingToday === 'number' ? ` · ${result.remainingToday} left today` : ''}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
