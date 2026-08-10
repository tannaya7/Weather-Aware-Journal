import { useEffect, useRef, useState } from 'react';
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
}) {
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
      <input
        ref={searchInputRef}
        type="text"
        className={styles.search}
        placeholder="Search entries..."
        aria-label="Search journal entries"
        value={localSearch}
        onChange={handleChange}
      />

      <select
        className={styles.select}
        aria-label="Sort entries"
        value={sortOrder}
        onChange={(e) => onSortChange(e.target.value)}
      >
        <option value="newest">Newest First</option>
        <option value="oldest">Oldest First</option>
      </select>

      <button
        type="button"
        className={styles.toggleBtn}
        aria-pressed={dateFilterMode === 'today'}
        aria-label="Filter to show only today's entries"
        onClick={onToggleToday}
      >
        Today
      </button>

      <button
        id="moodTrackerBtn"
        type="button"
        className={styles.toggleBtn}
        aria-expanded={moodPanelOpen}
        aria-label="View mood summary"
        onClick={onToggleMoodPanel}
      >
        Mood tracker
      </button>
    </div>
  );
}
