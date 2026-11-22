import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { enabledHabits } from '../../lib/habits.js';
import { describeGoal } from '../../lib/goals.js';
import { habitName } from '../HabitFields/HabitFields.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './GoalSettings.module.css';

// Sensible starting points when a goal is switched on.
const DEFAULT_THRESHOLD = {
  sleep: { direction: 'atLeast', threshold: 7 },
  water: { direction: 'atLeast', threshold: 8 },
  screen: { direction: 'atMost', threshold: 3 },
};

function startingGoal(habit) {
  if (habit.type === 'boolean') return { days: 3 };
  return { days: 5, ...(DEFAULT_THRESHOLD[habit.id] || { direction: 'atLeast', threshold: habit.min ?? 1 }) };
}

// Set a weekly goal for each tracked habit. Progress shows on Insights.
export function GoalSettings() {
  const { habitConfig, setHabitConfig } = useEntriesContext();
  const { t, tOr } = useI18n();
  const habits = enabledHabits(habitConfig);
  const goals = habitConfig.goals || {};

  function save(next) {
    setHabitConfig({ ...habitConfig, goals: next });
  }

  function toggle(habit) {
    if (goals[habit.id]) {
      save(Object.fromEntries(Object.entries(goals).filter(([key]) => key !== habit.id)));
    } else {
      save({ ...goals, [habit.id]: startingGoal(habit) });
    }
  }

  function change(habit, patch) {
    save({ ...goals, [habit.id]: { ...goals[habit.id], ...patch } });
  }

  if (habits.length === 0) {
    return <p className={styles.text}>{t('goalSettings.needHabit')}</p>;
  }

  return (
    <div className={styles.goals}>
      <p className={styles.text}>{t('goalSettings.intro')}</p>
      <ul className={styles.list}>
        {habits.map((habit) => {
          const goal = goals[habit.id];
          const isNumber = habit.type !== 'boolean';
          const name = habitName(habit, tOr);
          const unit = tOr(`unit.${habit.unit}`, habit.unit);
          return (
            <li key={habit.id} className={styles.item}>
              <label className={styles.check}>
                <input type="checkbox" checked={Boolean(goal)} onChange={() => toggle(habit)} />
                <span aria-hidden="true">{habit.emoji}</span> {name}
              </label>
              {goal && (
                <div className={styles.fields}>
                  {isNumber && (
                    <>
                      <label className={styles.field}>
                        <span className={styles.label}>{t('goalSettings.type', { habit: name })}</span>
                        <select
                          className={styles.select}
                          value={goal.direction}
                          onChange={(e) => change(habit, { direction: e.target.value })}
                        >
                          <option value="atLeast">{t('goalSettings.atLeast')}</option>
                          <option value="atMost">{t('goalSettings.atMost')}</option>
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span className={styles.label}>{t('goalSettings.amount', { habit: name, unit })}</span>
                        <input
                          className={styles.number}
                          type="number"
                          min={0}
                          max={habit.max ?? undefined}
                          step={habit.step ?? 1}
                          value={goal.threshold}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (e.target.value !== '' && Number.isFinite(value) && value >= 0) {
                              change(habit, { threshold: value });
                            }
                          }}
                        />
                      </label>
                    </>
                  )}
                  <label className={styles.field}>
                    <span className={styles.label}>{t('goalSettings.days', { habit: name })}</span>
                    <select
                      className={styles.select}
                      value={goal.days}
                      onChange={(e) => change(habit, { days: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <option key={n} value={n}>
                          {t('goalSettings.dayOption', { count: n })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={styles.summary}>{describeGoal(goal, habit, t, { name, unit })}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
