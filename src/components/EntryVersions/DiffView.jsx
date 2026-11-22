import { diffWords } from '../../lib/entryHistory.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './EntryVersions.module.css';

// What changed going from `from` to `to`, word by word. Deleted and added
// words are real <del> and <ins> elements, with a spoken marker for screen
// readers, so the meaning does not depend on color alone.
export function DiffView({ from, to, label }) {
  const { t } = useI18n();
  const parts = diffWords(from, to);
  if (!parts) {
    return (
      <p className={styles.note}>{t('versions.tooLong')}</p>
    );
  }
  return (
    <p className={styles.diff} aria-label={label}>
      {parts.map((part, i) => {
        if (part.kind === 'added') {
          return (
            <ins key={i} className={styles.added}>
              <span className="sr-only">{t('versions.added')}</span>
              {part.text}
              <span className="sr-only">]</span>
            </ins>
          );
        }
        if (part.kind === 'removed') {
          return (
            <del key={i} className={styles.removed}>
              <span className="sr-only">{t('versions.removed')}</span>
              {part.text}
              <span className="sr-only">]</span>
            </del>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </p>
  );
}
