import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { getServerUrl } from '../../lib/syncClient.js';
import {
  APP_VERSION,
  clearReports,
  isSendingEnabled,
  readReports,
  reportsAsText,
  setSendingEnabled,
} from '../../lib/errorReport.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './DiagnosticsSettings.module.css';

// Error reports: what was kept on this device, a way to copy them for a
// support message, and an opt-in to send them (never with journal text).
export function DiagnosticsSettings() {
  const { t, language } = useI18n();
  const [reports, setReports] = useState(readReports);
  const [sending, setSending] = useState(isSendingEnabled);
  const [message, setMessage] = useState('');
  const server = getServerUrl();

  return (
    <div className={styles.diagnostics}>
      <p className={styles.text}>{t('diag.about', { version: APP_VERSION })}</p>
      <p className={styles.text}>
        {reports.length === 0
          ? t('diag.none')
          : t('diag.count', { count: reports.length, when: new Date(reports[0].at).toLocaleString(language) })}
      </p>
      {reports.length > 0 && (
        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            small
            onClick={() =>
              navigator.clipboard
                ?.writeText(reportsAsText(reports))
                .then(() => setMessage(t('diag.copied')))
                .catch(() => setMessage(t('diag.copyFailed')))
            }
          >
            {t('diag.copy')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            small
            onClick={() => {
              clearReports();
              setReports([]);
              setMessage('');
            }}
          >
            {t('diag.clear')}
          </Button>
        </div>
      )}
      {message && <p className={styles.text}>{message}</p>}
      {server ? (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={sending}
            onChange={(e) => {
              setSendingEnabled(e.target.checked);
              setSending(e.target.checked);
            }}
          />
          {t('diag.send')}
        </label>
      ) : (
        <p className={styles.text}>{t('diag.local')}</p>
      )}
    </div>
  );
}
