import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBytes, getStorageStatus } from '../../lib/storageQuota.js';
import styles from './StorageNotice.module.css';

const RECHECK_MS = 5 * 60 * 1000;

// Appears across the top when the device is running low on room for the
// journal, before saving starts to fail. Stays out of the way otherwise.
// The live region is always present so the notice is announced when it shows.
export function StorageNotice() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      getStorageStatus().then((next) => {
        if (!cancelled) setStatus(next);
      });
    check();
    const timer = setInterval(check, RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const show = status?.supported && status.level !== 'ok';

  return (
    <div className={styles.region} aria-live="polite" aria-atomic="true">
      {show && (
        <p className={styles.bar} data-level={status.level}>
          <span>
            {status.level === 'critical'
              ? `This device is almost out of space for the journal (${formatBytes(status.usage)} of ${formatBytes(status.quota)}). New entries and photos may not save.`
              : `Space for the journal is getting low (${formatBytes(status.usage)} of ${formatBytes(status.quota)}).`}
          </span>
          <Link to="/settings" className={styles.link}>
            See what is using it
          </Link>
        </p>
      )}
    </div>
  );
}
