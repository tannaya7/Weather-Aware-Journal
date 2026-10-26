import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES } from './messages.js';
import { DEFAULT_LANGUAGE, initialLanguage, isSupported, saveLanguage, translate } from './translate.js';

const I18nContext = createContext({
  language: DEFAULT_LANGUAGE,
  languages: LANGUAGES,
  setLanguage: () => {},
  t: (key, values) => translate(DEFAULT_LANGUAGE, key, values),
});

// The app's language. Remembered on this device, and set on <html lang> so
// screen readers pronounce the interface in the right language.
export function I18nProvider({ children, initial }) {
  const [language, setLanguageState] = useState(() => (initial && isSupported(initial) ? initial : initialLanguage()));

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((code) => {
    if (!isSupported(code)) return;
    saveLanguage(code);
    setLanguageState(code);
  }, []);

  const value = useMemo(
    () => ({ language, languages: LANGUAGES, setLanguage, t: (key, values) => translate(language, key, values) }),
    [language, setLanguage],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
