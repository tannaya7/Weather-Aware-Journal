import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { requestReflection } from '../../lib/syncClient.js';
import { stripMarkdown } from '../../lib/richText.js';
import { allHabits } from '../../lib/habits.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
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
  const { t, language } = useI18n();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const optedIn = Boolean(settings.ai?.enabled);

  const chosen = scope === 'entry' ? [entry] : recentEntries(entries);
  const label = t(scope === 'entry' ? 'reflect.entry' : 'reflect.week');

  if (!sync.enabled) {
    return (
      <p className={styles.text}>{t('reflect.needSync')}</p>
    );
  }

  if (!optedIn) {
    return (
      <div className={styles.optIn}>
        <p className={styles.text}>
          {t('reflect.optInBefore')} <strong>{t('reflect.optInFields')}</strong> {t('reflect.optInAfter')}
        </p>
        <Button type="button" variant="secondary" small onClick={() => setSetting('ai', { enabled: true })}>
          {t('reflect.turnOn')}
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
        language,
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
          {busy ? t('reflect.thinking') : `✨ ${label}`}
        </Button>
        {chosen.length === 0 && <span className={styles.text}>{t('reflect.noEntries')}</span>}
        <button type="button" className={styles.link} onClick={() => setSetting('ai', { enabled: false })}>
          {t('reflect.turnOff')}
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
            {t('reflect.caption')}
            {typeof result.remainingToday === 'number' ? t('reflect.left', { count: result.remainingToday }) : ''}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
