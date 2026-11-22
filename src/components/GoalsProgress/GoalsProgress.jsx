import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { allGoalProgress, describeGoal } from '../../lib/goals.js';
import { habitName } from '../HabitFields/HabitFields.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './GoalsProgress.module.css';

function weekLabel(dayNumberValue, language) {
  return new Date(dayNumberValue * 86400000).toLocaleDateString(language, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function Status({ progress }) {
  const { t } = useI18n();
  if (progress.achieved) return <span className={styles.good}>{t('goals.reached')}</span>;
  if (progress.onTrack) {
    return <span>{t('goals.toGo', { more: progress.target - progress.metThisWeek, count: progress.daysLeft })}</span>;
  }
  return <span className={styles.behind}>{t('goals.outOfReach')}</span>;
}

function GoalRow({ habit, goal, progress }) {
  const { t, tOr, language } = useI18n();
  const name = habitName(habit, tOr);
  const unit = tOr(`unit.${habit.unit}`, habit.unit);
  const pct = Math.min(100, Math.round((progress.metThisWeek / progress.target) * 100));
  return (
    <li className={styles.row}>
      <div className={styles.top}>
        <p className={styles.name}>
          <span aria-hidden="true">{habit.emoji}</span> {describeGoal(goal, habit, t, { name, unit })}
        </p>
        {progress.streakWeeks > 0 && (
          <p className={styles.streak}>{t('goals.streak', { count: progress.streakWeeks })}</p>
        )}
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={t('goals.thisWeek', { habit: name })}
        aria-valuemin={0}
        aria-valuemax={progress.target}
        aria-valuenow={Math.min(progress.metThisWeek, progress.target)}
        aria-valuetext={t('goals.daysOf', { met: progress.metThisWeek, target: progress.target })}
      >
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.status}>
        {t('goals.daysOf', { met: progress.metThisWeek, target: progress.target })} · <Status progress={progress} />
      </p>
      <ul className={styles.weeks} aria-label={t('goals.earlier', { habit: name })}>
        {progress.history.map((w) => (
          <li
            key={w.weekStart}
            className={styles.week}
            data-achieved={w.achieved}
            title={t('goals.weekOf', { date: weekLabel(w.weekStart, language), met: w.met, target: progress.target })}
          >
            <span className={styles.mark} aria-hidden="true">
              {w.achieved ? '✓' : '·'}
            </span>
            <span className={styles.weekText}>
              {t('goals.weekOf', { date: weekLabel(w.weekStart, language), met: w.met, target: progress.target })}
              {w.achieved ? t('goals.weekReached') : ''}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

// This week's progress toward each habit goal, with the last eight weeks.
export function GoalsProgress({ entries, habits, goals }) {
  const { t } = useI18n();
  const items = useMemo(() => allGoalProgress(entries, habits, goals), [entries, habits, goals]);

  return (
    <section className={styles.card} aria-labelledby="goals-heading">
      <h2 id="goals-heading" className={styles.heading}>
        {t('goals.heading')}
      </h2>
      {items.length === 0 ? (
        <p className={styles.empty}>
          {t('goals.emptyBefore')} <Link to="/settings">{t('goals.emptyLink')}</Link> {t('goals.emptyAfter')}
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
