import { useRef, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { buildBackupFilename, createEncryptedBackup, readFileAsText } from '../../lib/backup.js';
import styles from './BackupSection.module.css';

export const MIN_BACKUP_PASSWORD = 8;

function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function count(n) {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`;
}

// Password-protected backup and restore (lib/backup.js).
export function BackupSection() {
  const { entries, importBackup } = useEntriesContext();
  const { announce } = useAnnouncer();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [makeMessage, setMakeMessage] = useState({ text: '', error: false });
  const [making, setMaking] = useState(false);

  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreMessage, setRestoreMessage] = useState({ text: '', error: false });
  const [restoring, setRestoring] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    if (password.length < MIN_BACKUP_PASSWORD) {
      return setMakeMessage({ text: `Use at least ${MIN_BACKUP_PASSWORD} characters.`, error: true });
    }
    if (password !== confirm) return setMakeMessage({ text: "The two passwords don't match.", error: true });

    setMaking(true);
    const text = await createEncryptedBackup(entries, password);
    downloadText(text, buildBackupFilename());
    setMaking(false);
    setPassword('');
    setConfirm('');
    const message = `Backup of ${count(entries.length)} downloaded. Keep the password safe: it can't be recovered.`;
    setMakeMessage({ text: message, error: false });
    announce(message);
  }

  async function handleRestore(e) {
    e.preventDefault();
    if (!file) return setRestoreMessage({ text: 'Choose a backup file first.', error: true });
    setRestoring(true);
    try {
      const result = await importBackup(await readFileAsText(file), restorePassword);
      const skipped = result.skippedCount ? ` ${count(result.skippedCount)} were already here.` : '';
      const message = `Restored ${count(result.importedCount)}.${skipped}`;
      setRestoreMessage({ text: message, error: false });
      announce(message);
      setRestorePassword('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setRestoreMessage({ text: err.message, error: true });
    }
    setRestoring(false);
  }

  return (
    <div className={styles.grid}>
      <form onSubmit={handleCreate} noValidate className={styles.form} aria-labelledby="make-backup-heading">
        <h3 id="make-backup-heading" className={styles.subheading}>
          Download an encrypted backup
        </h3>
        <p className={styles.text}>
          Everything, photos included, in one file that only opens with this password. Safe to keep
          in a cloud drive.
        </p>
        <label className={styles.field}>
          Backup password
          <input
            type="password"
            autoComplete="new-password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Repeat password
          <input
            type="password"
            autoComplete="new-password"
            className={styles.input}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {makeMessage.text && (
          <p className={makeMessage.error ? styles.error : styles.success} role={makeMessage.error ? 'alert' : 'status'}>
            {makeMessage.text}
          </p>
        )}
        <Button type="submit" disabled={making || entries.length === 0}>
          {making ? 'Encrypting…' : 'Download backup'}
        </Button>
      </form>

      <form onSubmit={handleRestore} noValidate className={styles.form} aria-labelledby="restore-heading">
        <h3 id="restore-heading" className={styles.subheading}>
          Restore from a backup
        </h3>
        <p className={styles.text}>Adds the backup&apos;s entries. Entries already here are kept, not replaced.</p>
        <label className={styles.field}>
          Backup file
          <input
            ref={fileRef}
            type="file"
            accept=".wjbackup,application/json"
            className={styles.input}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <label className={styles.field}>
          Backup password
          <input
            type="password"
            autoComplete="current-password"
            className={styles.input}
            value={restorePassword}
            onChange={(e) => setRestorePassword(e.target.value)}
          />
        </label>
        {restoreMessage.text && (
          <p className={restoreMessage.error ? styles.error : styles.success} role={restoreMessage.error ? 'alert' : 'status'}>
            {restoreMessage.text}
          </p>
        )}
        <Button type="submit" variant="secondary" disabled={restoring || !restorePassword}>
          {restoring ? 'Restoring…' : 'Restore'}
        </Button>
      </form>
    </div>
  );
}
