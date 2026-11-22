import { useRegisterSW } from 'virtual:pwa-register/react';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './UpdatePrompt.module.css';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// The service worker serves the cached app first, so after a deploy people
// would keep seeing the old version until a second reload. Instead, a new
// version waits in the background and this asks before switching to it, so
// nothing reloads under someone mid-sentence. Tabs left open also check for
// updates hourly.
export function UpdatePrompt() {
  const { t } = useI18n();
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
      <span>{t('update.available')}</span>
      <button type="button" className={styles.refresh} onClick={() => updateServiceWorker(true)}>
        {t('update.refresh')}
      </button>
      <button
        type="button"
        className={styles.later}
        onClick={() => setNeedRefresh(false)}
        aria-label={t('update.dismiss')}
        title={t('update.later')}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
