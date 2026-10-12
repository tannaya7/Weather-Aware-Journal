import { Link } from 'react-router-dom';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { describeSync } from '../../lib/syncStatus.js';
import styles from './SyncStatusBar.module.css';

const SHOWN = new Set(['offline', 'error', 'paused']);

function time(timestamp) {
  return new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// A slim bar across the top when syncing needs attention: offline (with how
// many changes are waiting), a problem it is retrying, or a pause that
// needs a decision. Stays out of the way when all is well. The live region
// is always on the page, so changes are announced.
export function SyncStatusBar() {
  const { sync } = useEntriesContext();
  const visible = sync.enabled && SHOWN.has(sync.status);

  return (
    <div className={styles.region} aria-live="polite" aria-atomic="true">
      {visible && (
        <p className={styles.bar} data-status={sync.status}>
          <span>{describeSync(sync, time)}</span>
          {sync.status !== 'offline' && (
            <Link to="/settings" className={styles.link}>
              Details
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
