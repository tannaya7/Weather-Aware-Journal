import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './HabitFields.module.css';

// Built-in habits show in the app's language; ones people named stay as named.
export function habitName(habit, tOr) {
  return habit.id.startsWith('custom-') ? habit.name : tOr(`habit.${habit.id}`, habit.name);
}

// Quick check-ins on the entry form: a number field per amount habit and a
// toggle per yes/no habit. Everything is optional.
export function HabitFields({ habits, values, onChange }) {
  const { t, tOr } = useI18n();
  if (habits.length === 0) return null;

  function set(id, value) {
    onChange({ ...values, [id]: value });
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>
        {t('habits.legend')} <span className={styles.optional}>{t('form.optional')}</span>
      </legend>
      <div className={styles.grid}>
        {habits.map((habit) =>
          habit.type === 'boolean' ? (
            <label key={habit.id} className={styles.toggle}>
              <input
                type="checkbox"
                checked={values[habit.id] === true}
                onChange={(e) => set(habit.id, e.target.checked ? true : '')}
              />
              <span aria-hidden="true">{habit.emoji}</span> {habitName(habit, tOr)}
            </label>
          ) : (
            <label key={habit.id} className={styles.number}>
              <span>
                <span aria-hidden="true">{habit.emoji}</span> {habitName(habit, tOr)}
              </span>
              <span className={styles.inputRow}>
                <input
                  type="number"
                  inputMode="decimal"
                  min={habit.min}
                  max={habit.max}
                  step={habit.step}
                  value={values[habit.id] ?? ''}
                  onChange={(e) => set(habit.id, e.target.value)}
                  className={styles.input}
                />
                <span className={styles.unit}>{tOr(`unit.${habit.unit}`, habit.unit)}</span>
              </span>
            </label>
          ),
        )}
      </div>
    </fieldset>
  );
}
