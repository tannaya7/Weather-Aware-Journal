import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEntriesContext } from './EntriesContext.jsx';
import { getEmbedder } from '../lib/embedder.js';
import { MODEL_ID, indexPlan, searchIndex, similarEntries, updateIndex } from '../lib/semantic.js';

// Search by meaning, shared by the whole app. Off until turned on in
// Settings. When on, keeps an index of every entry up to date in the
// background (saved with the journal, encrypted if there is a passcode),
// and answers "which entries are closest in meaning to this?".
//
// phase: off | loading-model | indexing | ready | error

const INERT = {
  enabled: false,
  phase: 'off',
  modelPercent: null,
  progress: null,
  error: '',
  indexedCount: 0,
  enable: async () => {},
  retry: () => {},
  disable: async () => {},
  search: async () => [],
  similarTo: () => [],
};

const SemanticContext = createContext(INERT);

const SAVE_EVERY_BATCHES = 5;

export function SemanticProvider({ children }) {
  const { entries, status, settings, setSetting } = useEntriesContext();
  const config = settings.semantic;
  const enabled = Boolean(config?.enabled);
  const modelMatches = config?.model === MODEL_ID;
  const storedIndex = config?.index;
  const index = useMemo(
    () => (enabled && modelMatches ? storedIndex || {} : null),
    [enabled, modelMatches, storedIndex],
  );

  const [phase, setPhase] = useState('off');
  const [modelPercent, setModelPercent] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const configRef = useRef(config);
  const entriesRef = useRef(entries);
  const runningRef = useRef(false);
  const dirtyRef = useRef(false);
  configRef.current = config;
  entriesRef.current = entries;

  const runSync = useCallback(async () => {
    if (runningRef.current) {
      dirtyRef.current = true;
      return;
    }
    runningRef.current = true;
    try {
      do {
        dirtyRef.current = false;
        const cfg = configRef.current;
        if (!cfg?.enabled) break;
        const current = cfg.model === MODEL_ID ? cfg.index || {} : {};
        const { stale, removed } = indexPlan(entriesRef.current, current);
        if (stale.length === 0 && removed.length === 0 && cfg.model === MODEL_ID) {
          setPhase('ready');
          continue;
        }

        setError('');
        setPhase('loading-model');
        const embedder = await getEmbedder(setModelPercent);
        setModelPercent(null);
        setPhase('indexing');
        setProgress({ done: 0, total: stale.length });

        let batches = 0;
        let saving = Promise.resolve();
        const keep = (next) => {
          const value = { enabled: true, model: MODEL_ID, index: next };
          configRef.current = value;
          return setSetting('semantic', value);
        };
        const result = await updateIndex({
          entries: entriesRef.current,
          index: current,
          embed: (texts) => embedder.embed(texts),
          onProgress: (done, total) => setProgress({ done, total }),
          onBatch: (next) => {
            batches += 1;
            if (batches % SAVE_EVERY_BATCHES === 0) saving = saving.then(() => keep(next));
          },
          shouldStop: () => !configRef.current?.enabled,
        });
        await saving;
        // Turned off while indexing: do not write the index back.
        if (!configRef.current?.enabled) break;
        await keep(result.index);
        setProgress(null);
        setPhase('ready');
      } while (dirtyRef.current);
    } catch (err) {
      setPhase('error');
      setModelPercent(null);
      setProgress(null);
      setError(
        navigator.onLine === false
          ? 'You are offline, and the search model is not downloaded yet. Try again when you are back online.'
          : 'Could not load the search model. Check your connection and try again.',
      );
      console.warn('Search by meaning failed', err);
    } finally {
      runningRef.current = false;
    }
  }, [setSetting]);

  // Keep the index current whenever entries change (but never while the
  // journal is still loading or locked, when the list is empty). The first
  // build starts at once; later top-ups wait a moment so typing does not
  // trigger one per keystroke.
  const indexedRef = useRef(0);
  indexedRef.current = index ? Object.keys(index).length : 0;
  useEffect(() => {
    if (!enabled) {
      setPhase('off');
      return undefined;
    }
    if (status !== 'ready') return undefined;
    const first = indexedRef.current === 0;
    setPhase((p) => (p === 'off' ? (first ? 'loading-model' : 'ready') : p));
    const timer = setTimeout(runSync, first ? 0 : 1500);
    return () => clearTimeout(timer);
  }, [enabled, status, entries, modelMatches, runSync]);

  // After a failure: try the same work again right away.
  const retry = useCallback(() => {
    setError('');
    setPhase('loading-model');
    runSync();
  }, [runSync]);

  const enable = useCallback(async () => {
    setError('');
    await setSetting('semantic', { enabled: true, model: MODEL_ID, index: index || {} });
  }, [setSetting, index]);

  const disable = useCallback(async () => {
    configRef.current = { enabled: false, model: MODEL_ID, index: {} };
    setPhase('off');
    setProgress(null);
    setModelPercent(null);
    setError('');
    // Removes the vectors too: they are derived from the journal's text.
    await setSetting('semantic', { enabled: false, model: MODEL_ID, index: {} });
  }, [setSetting]);

  const indexRef = useRef(index);
  indexRef.current = index;

  const search = useCallback(async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || !indexRef.current) return [];
    const embedder = await getEmbedder(setModelPercent);
    setModelPercent(null);
    const [vector] = await embedder.embed([trimmed]);
    return searchIndex(vector, indexRef.current);
  }, []);

  const similarTo = useCallback((id) => (indexRef.current ? similarEntries(id, indexRef.current) : []), []);

  const value = useMemo(
    () => ({
      enabled,
      phase: enabled ? phase : 'off',
      modelPercent,
      progress,
      error,
      indexedCount: index ? Object.keys(index).length : 0,
      enable,
      retry,
      disable,
      search,
      similarTo,
    }),
    [enabled, phase, modelPercent, progress, error, index, enable, retry, disable, search, similarTo],
  );

  return <SemanticContext.Provider value={value}>{children}</SemanticContext.Provider>;
}

export function useSemantic() {
  return useContext(SemanticContext);
}
