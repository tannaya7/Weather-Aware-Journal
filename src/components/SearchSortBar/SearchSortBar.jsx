import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './SearchSortBar.module.css';

export function SearchSortBar({
  searchValue,
  onSearchChange,
  sortOrder,
  onSortChange,
  dateFilterMode,
  onToggleToday,
  moodPanelOpen,
  onToggleMoodPanel,
  semanticAvailable = false,
  semanticMode = false,
  onToggleSemantic,
}) {
  const { t } = useI18n();
  const [localSearch, setLocalSearch] = useState(searchValue);
  const debounceRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    function handleSlash(e) {
      if (e.key === '/' && !e.ctrlKey && !e.altKey && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleSlash);
    return () => document.removeEventListener('keydown', handleSlash);
  }, []);

  function handleChange(e) {
    const value = e.target.value;
    setLocalSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(value), 300);
  }

  return (
    <div className={styles.bar} role="search">
      <span id="searchHelp" className="sr-only">
        {t('search.help')}
      </span>
      <input
        ref={searchInputRef}
        type="text"
        className={styles.search}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        aria-describedby="searchHelp"
        title='Words, "exact phrases", -leave-out, mood:, weather:, tag:, before:2025-06, after:2025, has:photo, has:voice'
        value={localSearch}
        onChange={handleChange}
      />

      <select
        className={styles.select}
        aria-label={t('search.sort')}
        value={sortOrder}
        onChange={(e) => onSortChange(e.target.value)}
      >
        <option value="newest">{t('search.newest')}</option>
        <option value="oldest">{t('search.oldest')}</option>
      </select>

      <button
        type="button"
        className={styles.toggleBtn}
        aria-pressed={dateFilterMode === 'today'}
        aria-label={t('search.todayLabel')}
        onClick={onToggleToday}
      >
        {t('search.today')}
      </button>

      {semanticAvailable && (
        <button
          type="button"
          className={styles.toggleBtn}
          aria-pressed={semanticMode}
          aria-label={t('search.meaningLabel')}
          title="Find entries by what they mean, not just the words"
          onClick={onToggleSemantic}
        >
          {t('search.meaning')}
        </button>
      )}

      <button
        id="moodTrackerBtn"
        type="button"
        className={styles.toggleBtn}
        aria-expanded={moodPanelOpen}
        aria-label={t('search.moodLabel')}
        onClick={onToggleMoodPanel}
      >
        {t('search.mood')}
      </button>
    </div>
  );
}
