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
import styles from './DiagnosticsSettings.module.css';

// Error reports: what was kept on this device, a way to copy them for a
// support message, and an opt-in to send them (never with journal text).
export function DiagnosticsSettings() {
  const [reports, setReports] = useState(readReports);
  const [sending, setSending] = useState(isSendingEnabled);
  const [message, setMessage] = useState('');
  const server = getServerUrl();

  return (
    <div className={styles.diagnostics}>
      <p className={styles.text}>
        When something goes wrong, the app keeps a short report on this device: the kind of error, where in the
        code, which page, and the app version (v{APP_VERSION}). Never what you wrote: quoted text, numbers,
        addresses, and entry ids are removed first.
      </p>
      <p className={styles.text}>
        {reports.length === 0
          ? 'No errors recorded.'
          : `${reports.length} ${reports.length === 1 ? 'error' : 'errors'} recorded, the latest at ${new Date(reports[0].at).toLocaleString()}.`}
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
                .then(() => setMessage('Copied. Paste it into a message if you want help.'))
                .catch(() => setMessage('Could not copy on this browser.'))
            }
          >
            Copy the reports
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
            Clear them
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
          Also send these reports to the sync server, to help fix problems
        </label>
      ) : (
        <p className={styles.text}>Reports stay on this device (there is no server set up to send them to).</p>
      )}
    </div>
  );
}
