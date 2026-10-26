import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { enabledHabits } from '../../lib/habits.js';
import { describeGoal } from '../../lib/goals.js';
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
    return <p className={styles.text}>Turn on a habit above to set a goal for it.</p>;
  }

  return (
    <div className={styles.goals}>
      <p className={styles.text}>
        Aim for a number of days each week (Monday to Sunday). Your progress shows on Insights.
      </p>
      <ul className={styles.list}>
        {habits.map((habit) => {
          const goal = goals[habit.id];
          const isNumber = habit.type !== 'boolean';
          return (
            <li key={habit.id} className={styles.item}>
              <label className={styles.check}>
                <input type="checkbox" checked={Boolean(goal)} onChange={() => toggle(habit)} />
                <span aria-hidden="true">{habit.emoji}</span> {habit.name}
              </label>
              {goal && (
                <div className={styles.fields}>
                  {isNumber && (
                    <>
                      <label className={styles.field}>
                        <span className={styles.label}>{habit.name} goal type</span>
                        <select
                          className={styles.select}
                          value={goal.direction}
                          onChange={(e) => change(habit, { direction: e.target.value })}
                        >
                          <option value="atLeast">At least</option>
                          <option value="atMost">At most</option>
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span className={styles.label}>{habit.name} amount ({habit.unit})</span>
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
                    <span className={styles.label}>{habit.name} days per week</span>
                    <select
                      className={styles.select}
                      value={goal.days}
                      onChange={(e) => change(habit, { days: Number(e.target.value) })}
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? 'day' : 'days'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={styles.summary}>{describeGoal(goal, habit)}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
