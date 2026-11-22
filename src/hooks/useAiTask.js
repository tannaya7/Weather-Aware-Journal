import { useCallback, useEffect, useRef, useState } from 'react';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { useAnnouncer } from '../context/AnnouncerContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { requestAiTask } from '../lib/syncClient.js';
import { aiErrorKey } from '../lib/aiTasks.js';

const IDLE = { status: 'idle', result: null, errorKey: '' };

// One Gemini helper (reflection, tag suggestions, or pattern insight).
// Nothing runs until run() is called, which only the person's button press
// does. While a request is out, further run() calls are ignored, so a double
// click can never send twice. A failure is shown and can be tried again by
// pressing the button again; nothing retries by itself.
export function useAiTask(task) {
  const { sync } = useEntriesContext();
  const { announce } = useAnnouncer();
  const { t } = useI18n();
  const [state, setState] = useState(IDLE);
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (body) => {
      if (busy.current) return;
      busy.current = true;
      setState({ status: 'loading', result: null, errorKey: '' });
      try {
        const result = await requestAiTask(sync.code, task, body);
        if (!alive.current) return;
        setState({ status: 'done', result, errorKey: '' });
        announce(t('ai.announce.done'));
      } catch (err) {
        if (alive.current) setState({ status: 'error', result: null, errorKey: aiErrorKey(err) });
      } finally {
        busy.current = false;
      }
    },
    [sync.code, task, announce, t],
  );

  const dismiss = useCallback(() => setState(IDLE), []);

  return { ...state, busy: state.status === 'loading', run, dismiss };
}
