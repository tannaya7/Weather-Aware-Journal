import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_DELAY_MS = 500;

// Debounced autosave for the entry form. Calls onSave(values, { urgent })
// shortly after the values stop changing, or onSave(null) when they're back
// to `baseline` (nothing worth keeping). A pending save is flushed right
// away, with urgent: true, when the tab is hidden or closed or the form
// unmounts, so the last few keystrokes aren't lost. Call stop() once the
// entry is saved for real.
export function useDraftAutosave(values, baseline, onSave, delay = DEFAULT_DELAY_MS) {
  const key = JSON.stringify(values);
  const baselineKey = JSON.stringify(baseline);

  const onSaveRef = useRef(onSave);
  const lastKeyRef = useRef(key); // unchanged since mount: nothing to save
  const pendingRef = useRef(undefined);
  const timerRef = useRef(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    onSaveRef.current = onSave;
  });

  const flush = useCallback((urgent) => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    if (pendingRef.current === undefined || stoppedRef.current) return;
    const value = pendingRef.current;
    pendingRef.current = undefined;
    onSaveRef.current(value, { urgent });
  }, []);

  useEffect(() => {
    if (key === lastKeyRef.current || stoppedRef.current) return;
    lastKeyRef.current = key;
    pendingRef.current = key === baselineKey ? null : JSON.parse(key);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(false), delay);
  }, [key, baselineKey, delay, flush]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') flush(true);
    }
    function handlePageHide() {
      flush(true);
    }
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      flush(true);
    };
  }, [flush]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = undefined;
  }, []);

  return { stop };
}
