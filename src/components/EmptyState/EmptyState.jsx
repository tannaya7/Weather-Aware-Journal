import { Link } from 'react-router-dom';
import buttonStyles from '../Button/Button.module.css';
import styles from './EmptyState.module.css';

export function EmptyState({ hasFilters }) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon} aria-hidden="true">
        {hasFilters ? '🔍' : '📔'}
      </span>
      <p className={styles.title}>
        {hasFilters ? 'No entries match your search or filters.' : 'No entries yet.'}
      </p>
      {!hasFilters && (
        <Link
          to="/new"
          className={`${buttonStyles.base} ${buttonStyles.primary}`}
          style={{ textDecoration: 'none' }}
        >
          + Write your first entry
        </Link>
      )}
    </div>
  );
}
