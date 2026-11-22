import { Button } from '../Button/Button.jsx';
import { useSemantic } from '../../context/SemanticContext.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './SemanticSettings.module.css';

function describe(semantic, t) {
  if (semantic.phase === 'loading-model') {
    return semantic.modelPercent === null
      ? t('semantic.loadingModel')
      : t('semantic.downloading', { percent: semantic.modelPercent });
  }
  if (semantic.phase === 'indexing' && semantic.progress) {
    return t('semantic.indexing', { done: semantic.progress.done, total: semantic.progress.total });
  }
  if (semantic.phase === 'error') return t(semantic.error);
  return t('semantic.ready', { count: semantic.indexedCount });
}

// Turn search by meaning on or off. Explains what it downloads and that
// the text stays on this device.
export function SemanticSettings() {
  const semantic = useSemantic();
  const { t } = useI18n();
  const busy = semantic.phase === 'loading-model' || semantic.phase === 'indexing';

  return (
    <div className={styles.semantic}>
      <p className={styles.text}>{t('semantic.intro')}</p>
      <ul className={styles.facts}>
        <li>{t('semantic.factDownload')}</li>
        <li>{t('semantic.factPrivate')}</li>
        <li>{t('semantic.factIndex')}</li>
      </ul>

      {semantic.enabled ? (
        <>
          <p className={styles.status} role="status">
            {describe(semantic, t)}
          </p>
          {busy && (
            <progress
              className={styles.progress}
              aria-label={t('semantic.progress')}
              max={100}
              value={
                semantic.phase === 'indexing' && semantic.progress && semantic.progress.total
                  ? Math.round((semantic.progress.done / semantic.progress.total) * 100)
                  : (semantic.modelPercent ?? undefined)
              }
            />
          )}
          <div className={styles.actions}>
            {semantic.phase === 'error' && (
              <Button type="button" onClick={semantic.retry}>
                {t('semantic.retry')}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={semantic.disable}>
              {t('semantic.off')}
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" onClick={semantic.enable}>
          {t('semantic.on')}
        </Button>
      )}
    </div>
  );
}
