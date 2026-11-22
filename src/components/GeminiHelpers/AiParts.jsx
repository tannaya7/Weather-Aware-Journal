import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './GeminiHelpers.module.css';

// Pieces shared by the four Gemini tasks. Every task is started only by the
// person pressing its button; what it sends is stated before first use and
// again beside the button, and every result sits in its own labelled panel,
// apart from the person's own writing. Results are not saved anywhere:
// closing one discards it.

// Needs sync (that is how the server knows whose request it is), then a
// one-time "I understand" that says what is sent, to whom, and the limits.
// Turning it off again is always one press away.
export function GeminiGate({ children }) {
  const { sync, settings, setSetting } = useEntriesContext();
  const { t } = useI18n();

  if (!sync.enabled) return <p className={styles.note}>{t('ai.needSync')}</p>;

  if (!settings.geminiAi?.consented) {
    return (
      <div className={styles.consent}>
        <h3 className={styles.consentTitle}>{t('ai.consent.title')}</h3>
        <p className={styles.note}>{t('ai.consent.sends')}</p>
        <p className={styles.note}>{t('ai.consent.tier')}</p>
        <p className={styles.note}>{t('ai.consent.limits')}</p>
        <p className={styles.note}>{t('ai.consent.accuracy')}</p>
        <Button
          type="button"
          variant="secondary"
          small
          onClick={() => setSetting('geminiAi', { consented: true })}
        >
          {t('ai.consent.turnOn')}
        </Button>
      </div>
    );
  }

  return (
    <>
      {children}
      <button
        type="button"
        className={styles.link}
        onClick={() => setSetting('geminiAi', { consented: false })}
      >
        {t('ai.turnOff')}
      </button>
    </>
  );
}

// A button's text: "Working…" while a request is out, otherwise an emoji
// that screen readers skip and the label.
export function ActionLabel({ busy, icon, children }) {
  const { t } = useI18n();
  if (busy) return t('ai.working');
  return (
    <>
      <span aria-hidden="true">{icon}</span> {children}
    </>
  );
}

// "AI-generated" label, the result, how many requests are left today, and a
// way to close it.
export function ResultFrame({ title, remaining, onDismiss, children }) {
  const { t } = useI18n();
  return (
    <section className={styles.result} aria-label={title}>
      <p className={styles.badge}>{t('ai.label')}</p>
      {children}
      {typeof remaining === 'number' && (
        <p className={styles.caption}>{t('ai.left', { count: Math.max(0, remaining) })}</p>
      )}
      <Button type="button" variant="secondary" small onClick={onDismiss}>
        {t('ai.dismiss')}
      </Button>
    </section>
  );
}

// The failure, in words, with a way to try again (a new request the person
// chooses; nothing retries by itself).
export function Failure({ task, onRetry }) {
  const { t } = useI18n();
  if (task.status !== 'error') return null;
  return (
    <div className={styles.errorRow}>
      <p className={styles.error} role="alert">
        {t(task.errorKey)}
      </p>
      <Button type="button" variant="secondary" small onClick={onRetry} disabled={task.busy}>
        {t('ai.retry')}
      </Button>
    </div>
  );
}

