import { useMemo, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import { useAiTask } from '../../hooks/useAiTask.js';
import {
  AI_TASKS,
  EXCERPT_CHARS,
  MAX_RANGE_DAYS,
  MIN_REVIEW_ENTRIES,
  REVIEW_PRESETS,
  buildReviewRequest,
  checkRange,
  lastDays,
  localDay,
} from '../../lib/aiTasks.js';
import { formatDateLong } from '../../lib/dateFormat.js';
import { ActionLabel, Failure, GeminiGate, ResultFrame } from './AiParts.jsx';
import { focusOn } from './focusOn.js';
import styles from './GeminiHelpers.module.css';

// In Insights: themes, notable moments, and a question for a period the
// person chooses (a week by default, or their own dates up to
// MAX_RANGE_DAYS). Before sending, it says the period, how many entries are
// in it, and how many short excerpts go along with the counts.
export function PeriodReviewAi() {
  const { entries } = useEntriesContext();
  const { t, language } = useI18n();
  const task = useAiTask(AI_TASKS.periodReview);
  const [choice, setChoice] = useState('7'); // a preset's days, or 'custom'
  const [custom, setCustom] = useState(() => lastDays(7));
  // The period and numbers the shown result was asked about.
  const [asked, setAsked] = useState(null);

  const range = choice === 'custom' ? custom : lastDays(Number(choice));
  const rangeOk = checkRange(range);
  const built = useMemo(
    () => (rangeOk ? buildReviewRequest(entries, range, language) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range is rebuilt each render; its parts are the real inputs
    [entries, rangeOk, range.from, range.to, language],
  );
  const sample = built?.sampleSize ?? 0;
  const enough = rangeOk && sample >= MIN_REVIEW_ENTRIES;
  const describe = (r, count) =>
    t('ai.review.sample', {
      from: formatDateLong(`${r.from}T12:00`, language),
      to: formatDateLong(`${r.to}T12:00`, language),
      count,
    });

  const reset = () => {
    task.dismiss();
    setAsked(null);
  };

  function ask() {
    setAsked({ range, sampleSize: built.sampleSize, excerptCount: built.excerptCount });
    task.run(built.request);
  }

  function close() {
    reset();
    focusOn('gemini-review-button');
  }

  const result = task.status === 'done' && asked ? task.result : null;

  return (
    <section className={styles.section} aria-labelledby="gemini-review-heading">
      <h2 id="gemini-review-heading" className={styles.heading}>
        {t('ai.review.title')}
      </h2>
      <p className={styles.note}>{t('ai.review.intro')}</p>
      <GeminiGate>
        <div className={styles.block}>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>{t('ai.review.range')}</span>
              <select
                value={choice}
                disabled={task.busy}
                onChange={(e) => {
                  setChoice(e.target.value);
                  reset();
                }}
              >
                {REVIEW_PRESETS.map((p) => (
                  <option key={p.days} value={String(p.days)}>
                    {t(p.labelKey)}
                  </option>
                ))}
                <option value="custom">{t('ai.review.custom')}</option>
              </select>
            </label>
            {choice === 'custom' && (
              <>
                <label className={styles.field}>
                  <span>{t('ai.review.from')}</span>
                  <input
                    type="date"
                    value={custom.from}
                    max={localDay(new Date())}
                    disabled={task.busy}
                    onChange={(e) => {
                      setCustom({ ...custom, from: e.target.value });
                      reset();
                    }}
                  />
                </label>
                <label className={styles.field}>
                  <span>{t('ai.review.to')}</span>
                  <input
                    type="date"
                    value={custom.to}
                    max={localDay(new Date())}
                    disabled={task.busy}
                    onChange={(e) => {
                      setCustom({ ...custom, to: e.target.value });
                      reset();
                    }}
                  />
                </label>
              </>
            )}
          </div>

          {!rangeOk ? (
            <p className={styles.error} role="alert">
              {t('ai.review.badRange', { max: MAX_RANGE_DAYS })}
            </p>
          ) : (
            <>
              <p className={styles.note}>{describe(range, sample)}</p>
              {sample > 0 && (
                <p className={styles.note}>
                  {t('ai.review.sends', { shown: built.excerptCount, chars: EXCERPT_CHARS })}
                </p>
              )}
              {!enough && (
                <p className={styles.note}>
                  {t('ai.review.tooFew', { min: MIN_REVIEW_ENTRIES, count: sample })}
                </p>
              )}
            </>
          )}

          <Button
            id="gemini-review-button"
            type="button"
            small
            disabled={!enough || task.busy}
            aria-busy={task.busy}
            onClick={ask}
          >
            <ActionLabel busy={task.busy} icon="🔎">
              {t('ai.review.button')}
            </ActionLabel>
          </Button>
          <Failure task={task} onRetry={ask} />

          {result && (
            <ResultFrame
              title={t('ai.review.result')}
              remaining={result.remainingToday}
              onDismiss={close}
            >
              <p className={styles.range}>
                {describe(asked.range, asked.sampleSize)} ·{' '}
                {t('ai.review.excerpts', { count: asked.excerptCount })}
              </p>
              {result.insufficient ? (
                <p className={styles.note}>{t('ai.review.insufficient')}</p>
              ) : (
                <>
                  <h3 className={styles.partTitle}>{t('ai.review.measured')}</h3>
                  <ul className={styles.list}>
                    {result.themes.map((theme) => (
                      <li key={theme}>{theme}</li>
                    ))}
                  </ul>
                  {result.notableMoments.length > 0 && (
                    <>
                      <h3 className={styles.partTitle}>{t('ai.review.moments')}</h3>
                      <ul className={styles.list}>
                        {result.notableMoments.map((moment) => (
                          <li key={moment}>{moment}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {result.interpretation && (
                    <>
                      <h3 className={styles.partTitle}>{t('ai.review.interpretation')}</h3>
                      <p className={styles.text}>{result.interpretation}</p>
                    </>
                  )}
                  {result.question && (
                    <>
                      <h3 className={styles.partTitle}>{t('ai.review.question')}</h3>
                      <p className={styles.text}>{result.question}</p>
                    </>
                  )}
                </>
              )}
              <p className={styles.caption}>{t('ai.review.caption')}</p>
            </ResultFrame>
          )}
        </div>
      </GeminiGate>
    </section>
  );
}
