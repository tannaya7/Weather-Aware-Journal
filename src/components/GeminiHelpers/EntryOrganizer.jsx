import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import { useAiTask } from '../../hooks/useAiTask.js';
import { AI_TASKS, entryForAi } from '../../lib/aiTasks.js';
import { emojiForMood } from '../../lib/moods.js';
import { ActionLabel, Failure, GeminiGate, ResultFrame } from './AiParts.jsx';
import { focusOn } from './focusOn.js';
import styles from './GeminiHelpers.module.css';

// On an entry's reading page: a summary, a few tag suggestions, and a mood
// suggestion for that one entry. Suggestions are shown apart from the entry;
// a tag or mood is applied only when the person presses its own button.
export function EntryOrganizer({ entry }) {
  const { t, tOr, language } = useI18n();
  const { updateEntry } = useEntriesContext();
  const { announce } = useAnnouncer();
  const task = useAiTask(AI_TASKS.organization);
  const [applying, setApplying] = useState(false);

  const ask = () =>
    task.run({ entry: entryForAi(entry), existingTags: entry.tags || [], language });
  const close = () => {
    task.dismiss();
    focusOn('gemini-organize-button');
  };

  // One change at a time, so two quick presses can't overwrite each other.
  async function apply(fields, message) {
    setApplying(true);
    try {
      await updateEntry(entry.id, fields);
      announce(message);
    } finally {
      setApplying(false);
    }
  }

  const have = new Set((entry.tags || []).map((tag) => tag.toLowerCase()));
  const result = task.status === 'done' ? task.result : null;
  const moodName = (mood) => tOr(`mood.${mood}`, mood);

  return (
    <section className={styles.section} aria-labelledby="gemini-organize-heading">
      <h2 id="gemini-organize-heading" className={styles.heading} tabIndex={-1}>
        {t('ai.org.heading')}
      </h2>
      <p className={styles.note}>{t('ai.org.intro')}</p>
      <GeminiGate>
        <div className={styles.block}>
          <p className={styles.note}>{t('ai.sendsEntry')}</p>
          <Button
            id="gemini-organize-button"
            type="button"
            small
            disabled={task.busy}
            aria-busy={task.busy}
            onClick={ask}
          >
            <ActionLabel busy={task.busy} icon="🗂️">
              {t('ai.org.button')}
            </ActionLabel>
          </Button>
          <Failure task={task} onRetry={ask} />
          {result && (
            <ResultFrame
              title={t('ai.org.title')}
              remaining={result.remainingToday}
              onDismiss={close}
            >
              <h3 className={styles.partTitle}>{t('ai.org.summary')}</h3>
              <p className={styles.text}>{result.summary}</p>

              <h3 className={styles.partTitle}>{t('ai.org.tags')}</h3>
              {result.tags.length === 0 ? (
                <p className={styles.note}>{t('ai.org.noTags')}</p>
              ) : (
                <ul className={styles.suggestions}>
                  {result.tags.map((tag) => (
                    <li key={tag}>
                      <span className={styles.suggestion}>{tag}</span>
                      {have.has(tag) ? (
                        <span className={styles.added}>{t('ai.tags.added')}</span>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          small
                          disabled={applying}
                          aria-label={t('ai.tags.addLabel', { tag })}
                          onClick={() =>
                            apply({ tags: [...(entry.tags || []), tag] }, t('ai.announce.tagAdded'))
                          }
                        >
                          {t('ai.tags.add')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {result.mood && (
                <>
                  <h3 className={styles.partTitle}>{t('ai.org.mood')}</h3>
                  <ul className={styles.suggestions}>
                    <li>
                      <span className={styles.suggestion}>
                        <span aria-hidden="true">{emojiForMood(result.mood)}</span>{' '}
                        {moodName(result.mood)}
                      </span>
                      {entry.mood === result.mood ? (
                        <span className={styles.added}>{t('ai.org.moodAlready')}</span>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          small
                          disabled={applying}
                          aria-label={t('ai.org.useMood', { mood: moodName(result.mood) })}
                          onClick={() => apply({ mood: result.mood }, t('ai.announce.moodSet'))}
                        >
                          {t('ai.org.use')}
                        </Button>
                      )}
                    </li>
                  </ul>
                </>
              )}
              <p className={styles.note}>{t('ai.org.hint')}</p>
              <p className={styles.caption}>{t('ai.org.caption')}</p>
            </ResultFrame>
          )}
        </div>
      </GeminiGate>
    </section>
  );
}
