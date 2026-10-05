import { useState } from 'react';
import { getPrompt } from '../../lib/prompts.js';
import styles from './WritingPrompt.module.css';

// A question to get you started on a new entry. Tapping it hands the text
// to the form (onUse) and hides the card; 🔄 swaps in a different one.
export function WritingPrompt({ weatherType, onUse, today = new Date() }) {
  const [shuffle, setShuffle] = useState(0);
  const [used, setUsed] = useState(false);

  if (used) return null;

  const prompt = getPrompt(today, weatherType, shuffle);

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
        aria-label={`Start writing from this prompt: ${prompt}`}
      >
        <span className={styles.label} aria-hidden="true">
          Need a starting point?
        </span>
        <span aria-hidden="true">{prompt}</span>
      </button>
      <button
        type="button"
        className={styles.shuffle}
        onClick={() => setShuffle((n) => n + 1)}
        aria-label="Show a different prompt"
        title="Show a different prompt"
      >
        <span aria-hidden="true">🔄</span>
      </button>
    </div>
  );
}
