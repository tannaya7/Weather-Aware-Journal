import { useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { DiffView } from './DiffView.jsx';
import { useAnnouncer } from '../../context/AnnouncerContext.jsx';
import { SOURCE_LABELS, conflictingVersion, resolution, versionFields } from '../../lib/entryHistory.js';
import styles from './EntryVersions.module.css';

function when(timestamp) {
  return new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function preview(text = '') {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat || '(no text)';
}

// Shown at the top of an entry that was edited on two devices at once. The
// newest edit is what you see; the other one is kept, and you choose.
export function ConflictNotice({ entry, onResolve }) {
  const [comparing, setComparing] = useState(false);
  const { announce } = useAnnouncer();
  const other = conflictingVersion(entry);

  function choose(how, message) {
    onResolve(resolution(entry, how));
    announce(message, 'polite');
  }

  return (
    <section className={styles.conflict} aria-labelledby="conflict-heading">
      <h2 id="conflict-heading" className={styles.conflictHeading}>
        Edited on two devices at once
      </h2>
      <p className={styles.note}>
        Two devices changed this entry before they had synced with each other. You are seeing the newest edit
        {other ? `, and the other one (from ${when(other.savedAt)}) is saved` : ''}. Nothing was lost.
      </p>
      {other && (
        <>
          <Button
            type="button"
            variant="secondary"
            small
            onClick={() => setComparing((c) => !c)}
            aria-expanded={comparing}
          >
            {comparing ? 'Hide the comparison' : 'Compare the two versions'}
          </Button>
          {comparing && (
            <div className={styles.compare}>
              <h3 className={styles.compareHeading}>From the other version to the one you see now</h3>
              <DiffView
                from={other.content || ''}
                to={entry.content || ''}
                label="Changes from the other version to the current one"
              />
            </div>
          )}
        </>
      )}
      <div className={styles.actions}>
        <Button type="button" onClick={() => choose('keep', 'Kept the version shown.')}>
          Keep this version
        </Button>
        {other && (
          <>
            <Button type="button" variant="secondary" onClick={() => choose('other', 'Switched to the other version.')}>
              Use the other version
            </Button>
            <Button type="button" variant="secondary" onClick={() => choose('both', 'Kept both versions in the entry.')}>
              Keep both
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

// The earlier versions of an entry, newest first, each restorable.
export function EntryHistory({ entry, onRestore }) {
  const history = entry.history || [];
  const [openIndex, setOpenIndex] = useState(null);
  const { announce } = useAnnouncer();
  if (history.length === 0) return null;

  function restore(version) {
    onRestore(versionFields(version));
    setOpenIndex(null);
    announce(
      `Restored the version from ${when(version.savedAt)}. What you had before is kept as an earlier version.`,
      'polite',
    );
  }

  return (
    <details className={styles.history}>
      <summary>Earlier versions ({history.length})</summary>
      <ul className={styles.versions}>
        {history.map((version, index) => (
          <li key={`${version.savedAt}-${index}`} className={styles.version}>
            <p className={styles.versionWhen}>
              {when(version.savedAt)}{' '}
              <span className={styles.source}>· {SOURCE_LABELS[version.source] || 'Earlier version'}</span>
            </p>
            <p className={styles.preview}>{preview(version.content)}</p>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                small
                aria-expanded={openIndex === index}
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                {openIndex === index ? 'Hide changes' : 'Show changes'}
              </Button>
              <Button type="button" variant="secondary" small onClick={() => restore(version)}>
                Restore this version
              </Button>
            </div>
            {openIndex === index && (
              <div className={styles.compare}>
                <h3 className={styles.compareHeading}>From this version to the current one</h3>
                <DiffView
                  from={version.content || ''}
                  to={entry.content || ''}
                  label="Changes from this version to the current one"
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
