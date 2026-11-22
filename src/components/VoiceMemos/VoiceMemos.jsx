import { Button } from '../Button/Button.jsx';
import { MAX_MEMO_SECONDS, formatDuration, useVoiceRecorder } from '../../hooks/useVoiceRecorder.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './VoiceMemos.module.css';

export const MAX_MEMOS = 3;

// Record, play back, and remove voice memos on the entry form. Hidden in
// browsers that can't record.
export function VoiceMemos({ memos, onChange }) {
  const { t } = useI18n();
  const { supported, recording, seconds, error, start, stop } = useVoiceRecorder((memo) =>
    onChange([...memos, memo].slice(0, MAX_MEMOS)),
  );

  if (!supported && memos.length === 0) return null;

  return (
    <div className={styles.memos}>
      <p className={styles.label}>
        {t('voice.label')} <span className={styles.optional}>{t('voice.hint', { max: MAX_MEMOS })}</span>
      </p>

      {memos.length > 0 && (
        <ul className={styles.list}>
          {memos.map((memo, i) => (
            <li key={memo.recordedAt || i} className={styles.memo}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the person's own voice memo; no captions exist */}
              <audio controls src={memo.src} preload="metadata" aria-label={t('voice.memo', { n: i + 1 })} />
              <span className={styles.duration}>{formatDuration(memo.duration || 0)}</span>
              <button
                type="button"
                className={styles.remove}
                onClick={() => onChange(memos.filter((_, j) => j !== i))}
                aria-label={t('voice.remove', { n: i + 1 })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {supported && memos.length < MAX_MEMOS && (
        <div className={styles.controls}>
          {recording ? (
            <>
              <Button type="button" small variant="danger" onClick={stop}>
                ⏹️ {t('voice.stop')}
              </Button>
              <span className={styles.timer} role="status">
                <span className={styles.dot} aria-hidden="true" />
                {t('voice.recording', { elapsed: formatDuration(seconds), max: formatDuration(MAX_MEMO_SECONDS) })}
              </span>
            </>
          ) : (
            <Button type="button" small variant="secondary" onClick={start}>
              🎙️ {t('voice.record')}
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
