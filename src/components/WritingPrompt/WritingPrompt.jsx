import { useState } from 'react';
import { getPrompt } from '../../lib/prompts.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './WritingPrompt.module.css';

// A question to get you started on a new entry. Tapping it hands the text
// to the form (onUse) and hides the card; 🔄 swaps in a different one.
export function WritingPrompt({ weatherType, onUse, today = new Date() }) {
  const { t, language } = useI18n();
  const [shuffle, setShuffle] = useState(0);
  const [used, setUsed] = useState(false);

  if (used) return null;

  const prompt = getPrompt(today, weatherType, shuffle, language);

  function handleUse() {
    setUsed(true);
    onUse(prompt);
  }

  return (
    <div className={styles.prompt}>
      <button
        type="button"
        className={styles.text}
        onClick={handleUse}
        aria-label={t('prompt.useLabel', { prompt })}
      >
        <span className={styles.label} aria-hidden="true">
          {t('prompt.label')}
        </span>
        <span aria-hidden="true">{prompt}</span>
      </button>
      <button
        type="button"
        className={styles.shuffle}
        onClick={() => setShuffle((n) => n + 1)}
        aria-label={t('prompt.shuffle')}
        title={t('prompt.shuffle')}
      >
        <span aria-hidden="true">🔄</span>
      </button>
    </div>
  );
}
