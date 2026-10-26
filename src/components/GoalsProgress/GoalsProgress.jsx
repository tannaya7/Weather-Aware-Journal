import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { allGoalProgress, describeGoal } from '../../lib/goals.js';
import styles from './GoalsProgress.module.css';

function weekLabel(dayNumberValue) {
  return new Date(dayNumberValue * 86400000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function Status({ progress }) {
  if (progress.achieved) return <span className={styles.good}>Goal reached this week</span>;
  if (progress.onTrack) {
    return (
      <span>
        {progress.target - progress.metThisWeek} more to go, {progress.daysLeft}{' '}
        {progress.daysLeft === 1 ? 'day' : 'days'} left
      </span>
    );
  }
  return <span className={styles.behind}>Out of reach this week. A fresh start on Monday.</span>;
}

function GoalRow({ habit, goal, progress }) {
  const pct = Math.min(100, Math.round((progress.metThisWeek / progress.target) * 100));
  return (
    <li className={styles.row}>
      <div className={styles.top}>
        <p className={styles.name}>
          <span aria-hidden="true">{habit.emoji}</span> {describeGoal(goal, habit)}
        </p>
        {progress.streakWeeks > 0 && (
          <p className={styles.streak}>
            {progress.streakWeeks} {progress.streakWeeks === 1 ? 'week' : 'weeks'} in a row
          </p>
        )}
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={`${habit.name} this week`}
        aria-valuemin={0}
        aria-valuemax={progress.target}
        aria-valuenow={Math.min(progress.metThisWeek, progress.target)}
        aria-valuetext={`${progress.metThisWeek} of ${progress.target} days`}
      >
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.status}>
        {progress.metThisWeek} of {progress.target} days · <Status progress={progress} />
      </p>
      <ul className={styles.weeks} aria-label={`${habit.name}, earlier weeks`}>
        {progress.history.map((w) => (
          <li
            key={w.weekStart}
            className={styles.week}
            data-achieved={w.achieved}
            title={`Week of ${weekLabel(w.weekStart)}: ${w.met} of ${progress.target}`}
          >
            <span className={styles.mark} aria-hidden="true">
              {w.achieved ? '✓' : '·'}
            </span>
            <span className={styles.weekText}>
              Week of {weekLabel(w.weekStart)}: {w.met} of {progress.target}
              {w.achieved ? ', reached' : ''}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

// This week's progress toward each habit goal, with the last eight weeks.
export function GoalsProgress({ entries, habits, goals }) {
  const items = useMemo(() => allGoalProgress(entries, habits, goals), [entries, habits, goals]);

  return (
    <section className={styles.card} aria-labelledby="goals-heading">
      <h2 id="goals-heading" className={styles.heading}>
        Weekly goals
      </h2>
      {items.length === 0 ? (
        <p className={styles.empty}>
          Set a goal for a habit in <Link to="/settings">Settings</Link> and track your week here.
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map(({ habit, goal, progress }) => (
            <GoalRow key={habit.id} habit={habit} goal={goal} progress={progress} />
          ))}
        </ul>
      )}
    </section>
  );
}
