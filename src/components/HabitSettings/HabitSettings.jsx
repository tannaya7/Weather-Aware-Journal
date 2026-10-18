import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { allHabits, makeCustomHabit } from '../../lib/habits.js';
import styles from './HabitSettings.module.css';

const MAX_NAME = 30;

// Choose which habits show on the entry form, and add your own yes/no ones.
// Turning a habit off hides it; values already saved on entries are kept.
export function HabitSettings() {
  const { habitConfig, setHabitConfig } = useEntriesContext();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [error, setError] = useState('');

  const enabled = new Set(habitConfig.enabled);

  function toggle(id) {
    const next = enabled.has(id) ? habitConfig.enabled.filter((h) => h !== id) : [...habitConfig.enabled, id];
    setHabitConfig({ ...habitConfig, enabled: next });
  }

  function handleAdd(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the habit a name.');
    if (allHabits(habitConfig).some((h) => h.name.toLowerCase() === trimmed.toLowerCase())) {
      return setError('You already have a habit with that name.');
    }
    const habit = makeCustomHabit(trimmed.slice(0, MAX_NAME), emoji.trim() || '✅');
    setHabitConfig({
      custom: [...habitConfig.custom, habit],
      enabled: [...habitConfig.enabled, habit.id],
    });
    setName('');
    setEmoji('');
    setError('');
  }

  function remove(id) {
    setHabitConfig({
      custom: habitConfig.custom.filter((h) => h.id !== id),
      enabled: habitConfig.enabled.filter((h) => h !== id),
    });
  }

  return (
    <div className={styles.habits}>
      <p className={styles.text}>
        Log these with each entry, and Insights shows which ones line up with your better days.
      </p>
      <ul className={styles.list}>
        {allHabits(habitConfig).map((habit) => (
          <li key={habit.id} className={styles.item}>
            <label className={styles.check}>
              <input type="checkbox" checked={enabled.has(habit.id)} onChange={() => toggle(habit.id)} />
              <span aria-hidden="true">{habit.emoji}</span> {habit.name}
              <span className={styles.kind}>{habit.type === 'boolean' ? 'yes / no' : habit.unit}</span>
            </label>
            {habit.id.startsWith('custom-') && (
              <button
                type="button"
                className={styles.remove}
                onClick={() => remove(habit.id)}
                aria-label={`Remove habit ${habit.name}`}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <form className={styles.add} onSubmit={handleAdd} noValidate>
        <label className={styles.field}>
          New yes/no habit
          <input
            className={styles.input}
            value={name}
            maxLength={MAX_NAME}
            placeholder="e.g. Meditated"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Emoji <span>(optional)</span>
          <input
            className={`${styles.input} ${styles.emoji}`}
            value={emoji}
            maxLength={4}
            placeholder="✅"
            onChange={(e) => setEmoji(e.target.value)}
          />
        </label>
        <Button type="submit" variant="secondary">
          Add habit
        </Button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
