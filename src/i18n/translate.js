import { LANGUAGES, MESSAGES } from './messages.js';

const STORAGE_KEY = 'weatherJournalLanguage';
export const DEFAULT_LANGUAGE = 'en';

export function isSupported(code) {
  return LANGUAGES.some((l) => l.code === code);
}

// The saved choice, else the browser's first language we have, else English.
export function initialLanguage(preferred = typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language]) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isSupported(saved)) return saved;
  } catch {
    // storage blocked: fall through
  }
  for (const tag of preferred) {
    const code = String(tag || '').toLowerCase().split('-')[0];
    if (isSupported(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}

export function saveLanguage(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // not remembered; harmless
  }
}

function lookup(language, key) {
  return MESSAGES[language]?.[key] ?? MESSAGES[DEFAULT_LANGUAGE][key];
}

// t('dashboard.count', { count: 3 }) picks dashboard.count_one/_other by the
// language's plural rules, and fills in {count}. An unknown key comes back
// as itself, so a mistake shows up on screen instead of a blank.
export function translate(language, key, values = {}) {
  let message;
  if (typeof values.count === 'number') {
    const form = new Intl.PluralRules(language).select(values.count);
    message = lookup(language, `${key}_${form}`) ?? lookup(language, `${key}_other`);
  }
  message ??= lookup(language, key);
  if (message === undefined) return key;
  return message.replace(/\{(\w+)\}/g, (match, name) =>
    values[name] === undefined ? match : typeof values[name] === 'number' ? values[name].toLocaleString(language) : String(values[name]),
  );
}
