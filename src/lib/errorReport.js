import { getServerUrl } from './syncClient.js';

// What went wrong, without what you wrote. A report keeps the kind of
// error, a scrubbed message, where in the code it happened, which page
// (with ids removed), and the app version. Anything in quotes in a message
// is removed (errors like "Unexpected token in 'Dear diary…'" can quote
// your words), as are long numbers, email addresses, and web addresses.
// Reports are kept on this device; they are only sent to the sync server
// if you turn that on in Settings.

const LOG_KEY = 'weatherJournalErrors';
const SEND_KEY = 'weatherJournalSendErrors';
const MAX_KEPT = 20;
const MAX_SENT_PER_SESSION = 10;
const MAX_MESSAGE = 300;
const MAX_STACK_LINES = 12;

export const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__; // eslint-disable-line no-undef

export function scrubText(text) {
  return String(text ?? '')
    .replace(/"[^"]*"|'[^']*'|`[^`]*`|“[^”]*”/g, '…')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\bhttps?:\/\/\S+/g, '<url>')
    .replace(/\b\d{5,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE);
}

// "at save (https://site/assets/index-abc.js?x=1:10:5)" -> "at save (index-abc.js:10:5)"
export function scrubStack(stack) {
  return String(stack ?? '')
    .split('\n')
    .slice(0, MAX_STACK_LINES)
    .map((line) =>
      line
        .replace(/(?:https?|file|blob|chrome-extension):\/\/[^\s)]*\/([^/\s)?#]+)(?:[?#][^\s):]*)?/g, '$1')
        .replace(/"[^"]*"|'[^']*'/g, '…')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

// "#/entry/1696512345.123/edit" -> "/entry/:id/edit"
export function scrubRoute(hashOrPath) {
  const path = String(hashOrPath || '/').replace(/^#/, '').split('?')[0] || '/';
  return path
    .split('/')
    .map((part) => (/^[\d.]+$|^[0-9a-f-]{16,}$|^dayone-|^md-/i.test(part) ? ':id' : part))
    .join('/');
}

export function makeReport(error, { kind = 'error', route = '/', componentStack = '' } = {}) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Non-error thrown');
  return {
    kind,
    name: err.name || 'Error',
    message: scrubText(err.message),
    stack: scrubStack(componentStack ? `${err.stack || ''}\n${componentStack}` : err.stack),
    route: scrubRoute(route),
    version: APP_VERSION,
    at: new Date().toISOString(),
  };
}

// --- Kept on this device --------------------------------------------------------

export function readReports() {
  try {
    const list = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function keep(report) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify([report, ...readReports()].slice(0, MAX_KEPT)));
  } catch {
    // storage full or blocked: the report is simply not kept
  }
}

export function clearReports() {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
}

export function isSendingEnabled() {
  try {
    return localStorage.getItem(SEND_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function setSendingEnabled(on) {
  try {
    if (on) localStorage.setItem(SEND_KEY, 'yes');
    else localStorage.removeItem(SEND_KEY);
  } catch {
    // ignore
  }
}

// --- Recording and sending ---------------------------------------------------------

const sentThisSession = new Set();

// Same error twice in a session is sent once; at most a few per session.
async function send(report, fetchImpl) {
  const server = getServerUrl();
  if (!server || !isSendingEnabled()) return false;
  const key = `${report.message}|${report.stack.split('\n')[1] || ''}`;
  if (sentThisSession.has(key) || sentThisSession.size >= MAX_SENT_PER_SESSION) return false;
  sentThisSession.add(key);
  try {
    const response = await fetchImpl(`${server}/v1/errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function recordError(error, options = {}, fetchImpl = typeof fetch === 'undefined' ? null : fetch) {
  const report = makeReport(error, { route: typeof location === 'undefined' ? '/' : location.hash, ...options });
  keep(report);
  if (fetchImpl) send(report, fetchImpl);
  return report;
}

// For tests.
export function resetSession() {
  sentThisSession.clear();
}

// Listens for errors nothing else caught. Returns a function to stop.
export function installErrorReporting(target = window) {
  const onError = (event) => {
    // Failed <img>/<script> loads also fire "error" with no error object.
    if (!event.error && !event.message) return;
    recordError(event.error || new Error(event.message), { kind: 'error' });
  };
  const onRejection = (event) => recordError(event.reason, { kind: 'unhandled-rejection' });
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}

// A short text to paste into a support message.
export function reportsAsText(reports = readReports()) {
  if (reports.length === 0) return 'No errors recorded.';
  return reports
    .map((r) => `[${r.at}] ${r.kind} on ${r.route} (v${r.version})\n${r.name}: ${r.message}\n${r.stack}`)
    .join('\n\n');
}
