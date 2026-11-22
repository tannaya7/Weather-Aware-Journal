import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import { useAiTask } from '../../hooks/useAiTask.js';
import {
  AI_TASKS,
  PROMPT_RECENT_ENTRIES,
  recentForPrompt,
  writingPromptRequest,
} from '../../lib/aiTasks.js';
import { ActionLabel, Failure, GeminiGate, ResultFrame } from './AiParts.jsx';
import { focusOn } from './focusOn.js';
import styles from './GeminiHelpers.module.css';

// In the new-entry form, under the usual writing prompt: one prompt made by
// Gemini on request. It is kept out of the draft until the person chooses
// "Use this prompt". It can use the weather type and today's date, and, only
// if the person ticks the box, the opening lines of their last few entries.
// Kept behind one small button so the writing flow stays uncluttered.
export function WritingPromptAi({ weatherType, onUse }) {
  const { entries } = useEntriesContext();
  const { t, language } = useI18n();
  const task = useAiTask(AI_TASKS.writingPrompt);
  const [open, setOpen] = useState(false);
  const [useRecent, setUseRecent] = useState(false);

  const available = recentForPrompt(entries).length;
  const ask = () => task.run(writingPromptRequest({ entries, useRecent, weatherType, language }));
  const close = () => {
    task.dismiss();
    setOpen(false);
    // The "ask" button comes back on the next render; focus it then.
    setTimeout(() => focusOn('gemini-prompt-open'), 0);
  };

  if (!open) {
    return (
      <button
        id="gemini-prompt-open"
        type="button"
        className={styles.link}
        onClick={() => setOpen(true)}
      >
        {t('ai.wp.open')}
      </button>
    );
  }

  const result = task.status === 'done' ? task.result : null;

  return (
    <div className={styles.planBox}>
      <h3 className={styles.consentTitle}>{t('ai.wp.heading')}</h3>
      <GeminiGate>
        <div className={styles.block}>
          <p className={styles.note}>
            {t(useRecent ? 'ai.wp.sendsRecent' : 'ai.wp.sends', { count: PROMPT_RECENT_ENTRIES })}
          </p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={useRecent}
              disabled={available === 0 || task.busy}
              onChange={(e) => setUseRecent(e.target.checked)}
            />
            <span>
              {available === 0
                ? t('ai.wp.noRecent')
                : t('ai.wp.recent', { count: Math.min(available, PROMPT_RECENT_ENTRIES) })}
            </span>
          </label>
          <Button
            id="gemini-prompt-button"
            type="button"
            small
            disabled={task.busy}
            aria-busy={task.busy}
            onClick={ask}
          >
            <ActionLabel busy={task.busy} icon="💡">
              {t(result ? 'ai.wp.another' : 'ai.wp.button')}
            </ActionLabel>
          </Button>
          <Failure task={task} onRetry={ask} />
          {result && (
            <ResultFrame
              title={t('ai.wp.title')}
              remaining={result.remainingToday}
              onDismiss={close}
            >
              <p className={styles.text}>{result.prompt}</p>
              <Button
                type="button"
                small
                onClick={() => {
                  onUse(result.prompt);
                  close();
                }}
              >
                {t('ai.wp.use')}
              </Button>
              <p className={styles.caption}>{t('ai.wp.caption')}</p>
            </ResultFrame>
          )}
        </div>
      </GeminiGate>
      {task.status !== 'done' && (
        <button type="button" className={styles.link} onClick={close}>
          {t('ai.wp.close')}
        </button>
      )}
    </div>
  );
}
