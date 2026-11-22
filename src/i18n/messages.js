// The app's words, by language: one file per language in locales/. English
// is complete, and a test makes sure every other language has the same keys.
// Anything missing at run time falls back to English. `{name}` is filled in
// from the values passed to t(). A key ending in _one / _other is chosen by
// count (see translate.js).
import en from './locales/en.js';
import es from './locales/es.js';
import hi from './locales/hi.js';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'hi', name: 'हिन्दी' },
];

export const MESSAGES = { en, es, hi };
