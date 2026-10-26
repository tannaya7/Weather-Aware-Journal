import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../Button/Button.jsx';
import { useEntriesContext } from '../../context/EntriesContext.jsx';
import { shrinkPhotos, shrinkable } from '../../lib/photoShrink.js';
import {
  formatBytes,
  getStorageStatus,
  journalBreakdown,
  requestPersistence,
  syncSize,
} from '../../lib/storageQuota.js';
import styles from './StorageSettings.module.css';

function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// How much room the journal has and what is using it, with a way to make
// stored photos smaller. Photos are the one thing that grows without
// bound, and they are what can push a journal past what sync accepts.
export function StorageSettings() {
  const { entries, updateEntry, sync } = useEntriesContext();
  const [status, setStatus] = useState(null);
  const [protectionMessage, setProtectionMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [run, setRun] = useState({ state: 'idle' }); // idle | running | done
  const stopRef = useRef(false);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const breakdown = useMemo(() => journalBreakdown(entries), [entries]);
  const candidates = useMemo(() => shrinkable(entries), [entries]);
  const syncInfo = useMemo(() => syncSize(entries), [entries]);

  const refresh = useCallback(() => getStorageStatus().then(setStatus), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function protect() {
    const granted = await requestPersistence();
    setProtectionMessage(
      granted
        ? 'Done. The browser will keep this journal even when space runs low.'
        : 'The browser did not agree this time. Installing the app to your home screen, or using it more, often helps.',
    );
    refresh();
  }

  async function startShrinking() {
    setConfirming(false);
    stopRef.current = false;
    setRun({ state: 'running', done: 0, total: candidates.photos, bytesSaved: 0 });
    const result = await shrinkPhotos({
      entries: entriesRef.current,
      update: updateEntry,
      shouldStop: () => stopRef.current,
      onProgress: ({ done, total, bytesSaved }) => setRun({ state: 'running', done, total, bytesSaved }),
    });
    setRun({ state: 'done', ...result });
    refresh();
  }

  const running = run.state === 'running';

  return (
    <div className={styles.storage}>
      {status?.supported ? (
        <>
          <progress
            className={styles.meter}
            max={100}
            value={Math.max(1, Math.round(status.fraction * 100))}
            aria-label="Storage used on this device"
          />
          <p className={styles.text} data-level={status.level}>
            This site is using {formatBytes(status.usage)} of the {formatBytes(status.quota)} the browser allows
            ({Math.max(1, Math.round(status.fraction * 100))}%).
            {status.level !== 'ok' && ' That is getting full.'}
          </p>
        </>
      ) : (
        <p className={styles.text}>This browser does not say how much space is left.</p>
      )}

      <p className={styles.text}>
        Your journal is about {formatBytes(breakdown.total)}: writing {formatBytes(breakdown.text)},{' '}
        {count(breakdown.photos, 'photo', 'photos')} ({formatBytes(breakdown.photoBytes)}),{' '}
        {count(breakdown.voice, 'voice memo', 'voice memos')} ({formatBytes(breakdown.voiceBytes)}).
      </p>

      {sync.enabled && (
        <p className={styles.text} data-level={syncInfo.level === 'ok' ? 'ok' : 'warn'}>
          Size when synced: about {formatBytes(syncInfo.estimated)} of the {formatBytes(syncInfo.limit)} the sync
          server accepts.
          {syncInfo.level === 'close' && ' Getting close: making photos smaller will keep sync working.'}
          {syncInfo.level === 'over' && ' Over the limit, so sync cannot upload until photos are made smaller.'}
        </p>
      )}

      {status?.supported && status.persisted !== null && (
        <div className={styles.block}>
          <p className={styles.text}>
            {status.persisted
              ? 'Protected: the browser will not clear this journal when the device runs low on space.'
              : 'Not protected: if the device runs very low on space, the browser may clear this journal. Syncing or exporting a backup keeps a copy elsewhere.'}
          </p>
          {!status.persisted && (
            <Button type="button" variant="secondary" small onClick={protect}>
              Ask the browser to protect it
            </Button>
          )}
          {protectionMessage && (
            <p className={styles.text} role="status">
              {protectionMessage}
            </p>
          )}
        </div>
      )}

      <div className={styles.block}>
        <h3 className={styles.subheading}>Photos</h3>
        {candidates.photos === 0 && run.state !== 'done' ? (
          <p className={styles.text}>All your photos are already a good size.</p>
        ) : (
          <>
            {run.state !== 'running' && candidates.photos > 0 && (
              <p className={styles.text}>
                {count(candidates.photos, 'photo is', 'photos are')} over 150 KB ({formatBytes(candidates.bytes)}{' '}
                together). Making them smaller (up to 1280 pixels on the longest side) keeps them sharp on screen and
                saves room.
              </p>
            )}

            {!running && !confirming && candidates.photos > 0 && (
              <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
                Make {count(candidates.photos, 'photo', 'photos')} smaller…
              </Button>
            )}

            {confirming && (
              <div className={styles.confirm}>
                <p className={styles.text}>
                  This replaces the photos with smaller copies, on this device and on any device you sync with. The
                  originals cannot be brought back. You can stop at any time, and what is finished stays finished.
                </p>
                <div className={styles.actions}>
                  <Button type="button" onClick={startShrinking}>
                    Yes, make them smaller
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {running && (
              <>
                <progress
                  className={styles.meter}
                  max={Math.max(run.total, 1)}
                  value={run.done}
                  aria-label="Making photos smaller"
                />
                <p className={styles.text} role="status">
                  {run.done} of {run.total} photos, {formatBytes(run.bytesSaved)} saved so far.
                </p>
                <Button type="button" variant="secondary" small onClick={() => (stopRef.current = true)}>
                  Stop
                </Button>
              </>
            )}

            {run.state === 'done' && (
              <p className={styles.text} role="status">
                {run.stopped ? 'Stopped. ' : 'Done. '}
                {count(run.photosShrunk, 'photo', 'photos')} made smaller, {formatBytes(run.bytesSaved)} saved.
                {run.failed > 0 && ` ${count(run.failed, 'photo', 'photos')} could not be changed.`}
                {run.stopped && ' You can carry on later; finished photos are skipped.'}
                {!run.stopped && run.photosShrunk === 0 && run.total > 0 && ' This browser could not make the rest any smaller.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
