import { splitHighlights } from '../../lib/search.js';
import styles from './Highlight.module.css';

// Text with search matches wrapped in <mark>.
export function Highlight({ text, terms }) {
  if (!terms?.length) return text;
  return splitHighlights(text, terms).map((part, i) =>
    part.match ? (
      <mark key={i} className={styles.mark}>
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}
