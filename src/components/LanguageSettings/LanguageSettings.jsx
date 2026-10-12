import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from '../../pages/Settings.module.css';

// Choose the app's language. Entries are never translated.
export function LanguageSettings() {
  const { t, language, languages, setLanguage } = useI18n();
  return (
    <>
      <p className={styles.text}>{t('settings.languageHelp')}</p>
      <label htmlFor="languageSelect" className="sr-only">
        {t('settings.languageLabel')}
      </label>
      <select id="languageSelect" value={language} onChange={(e) => setLanguage(e.target.value)}>
        {languages.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </>
  );
}
