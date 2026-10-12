import { Button } from '../Button/Button.jsx';
import { useSemantic } from '../../context/SemanticContext.jsx';
import styles from './SemanticSettings.module.css';

function describe(semantic) {
  if (semantic.phase === 'loading-model') {
    return semantic.modelPercent === null
      ? 'Getting the search model ready…'
      : `Downloading the search model… ${semantic.modelPercent}%`;
  }
  if (semantic.phase === 'indexing' && semantic.progress) {
    return `Reading your entries… ${semantic.progress.done} of ${semantic.progress.total}`;
  }
  if (semantic.phase === 'error') return semantic.error;
  const n = semantic.indexedCount;
  return `Ready. ${n} ${n === 1 ? 'entry' : 'entries'} can be found by meaning.`;
}

// Turn search by meaning on or off. Explains what it downloads and that
// the text stays on this device.
export function SemanticSettings() {
  const semantic = useSemantic();
  const busy = semantic.phase === 'loading-model' || semantic.phase === 'indexing';

  return (
    <div className={styles.semantic}>
      <p className={styles.text}>
        Find entries by what they mean, not just the words they use: &quot;a day I felt
        overwhelmed&quot; can find an entry that never says &quot;overwhelmed&quot;. A small language model
        runs on this device to do it.
      </p>
      <ul className={styles.facts}>
        <li>It downloads about 50 MB once, the first time you turn this on (the model and the engine that runs it), then works offline.</li>
        <li>Your entries never leave this device. Only the model files are downloaded, from Hugging Face.</li>
        <li>The index is saved with your journal, and encrypted if you set a passcode.</li>
      </ul>

      {semantic.enabled ? (
        <>
          <p className={styles.status} role="status">
            {describe(semantic)}
          </p>
          {busy && (
            <progress
              className={styles.progress}
              aria-label="Search by meaning setup"
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
                Try again
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={semantic.disable}>
              Turn off and delete the index
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" onClick={semantic.enable}>
          Turn on search by meaning
        </Button>
      )}
    </div>
  );
}
