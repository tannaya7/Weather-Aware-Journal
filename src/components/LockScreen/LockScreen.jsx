import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { passkeyErrorKey } from '../../lib/passkey.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './LockScreen.module.css';

const ERASE_CONFIRM = 'ERASE';

// Shown instead of the app while the journal is locked. A wrong passcode
// can't be recovered from, so the only way out of a forgotten one is to
// erase the journal — which takes typing ERASE to confirm.
export function LockScreen({ onUnlock, onUnlockWithPasskey, onErase }) {
  const { t } = useI18n();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showErase, setShowErase] = useState(false);
  const [eraseText, setEraseText] = useState('');

  async function handlePasskey() {
    setBusy(true);
    setError('');
    try {
      await onUnlockWithPasskey();
    } catch (err) {
      setError(t(passkeyErrorKey(err)));
      setBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!passcode) return;
    setBusy(true);
    setError('');
    try {
      await onUnlock(passcode);
    } catch (err) {
      setError(t(err.name === 'WrongPasscodeError' ? 'lock.wrong' : 'lock.failed'));
      setPasscode('');
      setBusy(false);
    }
  }

  return (
    <div className={styles.screen} role="main" id="main-content">
      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <span className={styles.icon} aria-hidden="true">
          🔒
        </span>
        <h1 className={styles.title}>{t('lock.title')}</h1>

        {onUnlockWithPasskey && (
          <>
            <Button type="button" onClick={handlePasskey} disabled={busy}>
              <span aria-hidden="true">👆</span> {t('lock.passkey')}
            </Button>
            <p className={styles.or}>{t('lock.or')}</p>
          </>
        )}

        <label className="sr-only" htmlFor="unlockPasscode">
          {t('lock.passcode')}
        </label>
        <input
          id="unlockPasscode"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          placeholder={t('lock.passcode')}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the lock screen's only job
          autoFocus
          value={passcode}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'unlockError' : undefined}
          onChange={(e) => setPasscode(e.target.value)}
        />
        {error && (
          <p id="unlockError" className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant={onUnlockWithPasskey ? 'secondary' : 'primary'} disabled={busy || !passcode}>
          {busy ? t('lock.unlocking') : t('lock.unlock')}
        </Button>

        {!showErase ? (
          <button type="button" className={styles.link} onClick={() => setShowErase(true)}>
            {t('lock.forgot')}
          </button>
        ) : (
          <div className={styles.erase}>
            <p>
              {t('lock.eraseText')} <strong>{t('lock.eraseWarning')}</strong>
            </p>
            <label htmlFor="eraseConfirm">{t('lock.typeToConfirm', { word: ERASE_CONFIRM })}</label>
            <input
              id="eraseConfirm"
              className={styles.input}
              value={eraseText}
              autoComplete="off"
              onChange={(e) => setEraseText(e.target.value)}
            />
            <div className={styles.eraseActions}>
              <Button
                type="button"
                variant="danger"
                disabled={eraseText !== ERASE_CONFIRM}
                onClick={onErase}
              >
                {t('lock.erase')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowErase(false);
                  setEraseText('');
                }}
              >
                {t('lock.cancel')}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
