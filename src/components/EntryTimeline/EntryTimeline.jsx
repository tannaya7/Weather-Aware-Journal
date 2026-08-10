import { EntryCard } from '../EntryCard/EntryCard.jsx';
import { EmptyState } from '../EmptyState/EmptyState.jsx';
import { groupEntriesByMonth } from '../../lib/groupByMonth.js';
import styles from './EntryTimeline.module.css';

export function EntryTimeline({ entries, hasFilters, onEdit, onDelete }) {
  if (entries.length === 0) {
    return <EmptyState hasFilters={hasFilters} />;
  }

  const groups = groupEntriesByMonth(entries);

  return (
    <div className={`${styles.timeline} fade-in`} aria-labelledby="entries-heading">
      {groups.map((group) => (
        <section key={group.key} className={styles.month} aria-label={group.label}>
          <h3 className={styles.monthLabel}>{group.label}</h3>
          <ul className={styles.list}>
            {group.entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
