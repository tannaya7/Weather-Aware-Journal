import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../Button/Button.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import { useAiTask } from '../../hooks/useAiTask.js';
import { AI_TASKS, PLAN_PREFERENCES, dayPlanRequest, isForecastFresh } from '../../lib/aiTasks.js';
import { formatDateLong } from '../../lib/dateFormat.js';
import { ActionLabel, Failure, GeminiGate, ResultFrame } from './AiParts.jsx';
import { focusOn } from './focusOn.js';
import styles from './GeminiHelpers.module.css';

// Inside the forecast card: a practical plan for one of the days the card
// has already loaded. It uses that forecast as it is (no extra weather
// request), says which day and when it was loaded, and refuses a forecast
// that has gone stale. `days` and `fetchedAt` come from ForecastPrompt.
export function DayPlan({ days, fetchedAt }) {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const task = useAiTask(AI_TASKS.dayPlan);
  const [index, setIndex] = useState(0);
  const [preference, setPreference] = useState('none');
  // The forecast found stale when asking (a newer forecast clears this).
  const [staleFor, setStaleFor] = useState(null);
  // Which day and forecast the shown plan was made from.
  const [asked, setAsked] = useState(null);

  const day = days[Math.min(index, days.length - 1)];
  const dateWords = (d) => formatDateLong(`${d}T12:00`, language);
  const timeWords = (ms) =>
    new Date(ms).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' });
  const isStale = staleFor === fetchedAt || !isForecastFresh(fetchedAt);

  function ask() {
    // Checked again at the moment of asking: the card may have been open a while.
    if (!isForecastFresh(fetchedAt)) {
      setStaleFor(fetchedAt);
      return;
    }
    setAsked({ date: day.date, fetchedAt });
    task.run(dayPlanRequest(day, preference, language));
  }

  function change(setter) {
    return (e) => {
      setter(e.target.value);
      task.dismiss();
      setAsked(null);
    };
  }

  function close() {
    task.dismiss();
    setAsked(null);
    focusOn('gemini-plan-button');
  }

  const result = task.status === 'done' && asked ? task.result : null;

  return (
    <div className={styles.planBox}>
      <h3 className={styles.consentTitle}>{t('ai.plan.heading')}</h3>
      <p className={styles.note}>{t('ai.plan.intro')}</p>
      <GeminiGate>
        <div className={styles.block}>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>{t('ai.plan.day')}</span>
              <select
                value={index}
                onChange={change((v) => setIndex(Number(v)))}
                disabled={task.busy}
              >
                {days.map((d, i) => (
                  <option key={d.date} value={i}>
                    {dateWords(d.date)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>{t('ai.plan.preference')}</span>
              <select value={preference} onChange={change(setPreference)} disabled={task.busy}>
                {PLAN_PREFERENCES.map((p) => (
                  <option key={p} value={p}>
                    {t(`ai.plan.pref.${p}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.note}>
            {t('ai.plan.based', { date: dateWords(day.date), time: timeWords(fetchedAt) })}
          </p>
          <p className={styles.note}>{t('ai.plan.sends')}</p>
          {isStale && (
            <p className={styles.error} role="alert">
              {t('ai.plan.stale')}
            </p>
          )}
          <Button
            id="gemini-plan-button"
            type="button"
            small
            disabled={task.busy || isStale}
            aria-busy={task.busy}
            onClick={ask}
          >
            <ActionLabel busy={task.busy} icon="🗓️">
              {t('ai.plan.button')}
            </ActionLabel>
          </Button>
          <Failure task={task} onRetry={ask} />
          {result && (
            <ResultFrame
              title={t('ai.plan.title')}
              remaining={result.remainingToday}
              onDismiss={close}
            >
              <p className={styles.range}>
                {t('ai.plan.based', {
                  date: dateWords(asked.date),
                  time: timeWords(asked.fetchedAt),
                })}
              </p>
              <h3 className={styles.partTitle}>{t('ai.plan.ideas')}</h3>
              <ul className={styles.list}>
                {result.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              {result.question && (
                <>
                  <h3 className={styles.partTitle}>{t('ai.plan.question')}</h3>
                  <p className={styles.text}>{result.question}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    small
                    onClick={() => navigate('/new', { state: { prompt: result.question } })}
                  >
                    {t('ai.plan.write')}
                  </Button>
                </>
              )}
              <p className={styles.caption}>{t('ai.plan.caption')}</p>
            </ResultFrame>
          )}
        </div>
      </GeminiGate>
    </div>
  );
}
