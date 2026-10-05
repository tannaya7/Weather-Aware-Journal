import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './UpdatePrompt.module.css';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// The service worker serves the cached app first, so after a deploy people
// would keep seeing the old version until a second reload. Instead, a new
// version waits in the background and this asks before switching to it, so
// nothing reloads under someone mid-sentence. Tabs left open also check for
// updates hourly.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        setInterval(() => registration.update(), CHECK_INTERVAL_MS);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className={styles.toast} role="status">
      <span>A new version of Weather Journal is available.</span>
      <button type="button" className={styles.refresh} onClick={() => updateServiceWorker(true)}>
        Refresh
      </button>
      <button
        type="button"
        className={styles.later}
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss update notification"
        title="Later"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
