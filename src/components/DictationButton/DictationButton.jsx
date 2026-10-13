import { useDictation } from '../../hooks/useDictation.js';
import styles from './DictationButton.module.css';

// 🎤 next to the writing area. Hidden in browsers without speech
// recognition. Says plainly where the audio goes, since this is a private
// journal: browsers do the speech-to-text with an online service.
export function DictationButton({ onText }) {
  const { supported, listening, interim, error, start, stop } = useDictation(onText);
  if (!supported) return null;

  return (
    <div className={styles.dictation}>
      <button
        type="button"
        className={styles.button}
        aria-pressed={listening}
        onClick={listening ? stop : start}
      >
        <span aria-hidden="true">{listening ? '⏹️' : '🎤'}</span>{' '}
        {listening ? 'Stop dictating' : 'Dictate'}
      </button>
      {listening && (
        <span className={styles.status} role="status">
          <span className={styles.pulse} aria-hidden="true" />
          Listening…{interim && <em className={styles.interim}> {interim}</em>}
        </span>
      )}
      {!listening && !error && (
        <span className={styles.note}>Your browser&apos;s online speech service turns speech into text.</span>
      )}
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
