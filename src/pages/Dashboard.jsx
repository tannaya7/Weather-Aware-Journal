import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header/Header.jsx';
import { Button } from '../components/Button/Button.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { SearchSortBar } from '../components/SearchSortBar/SearchSortBar.jsx';
import { FilterChips } from '../components/FilterChips/FilterChips.jsx';
import { EntryTimeline } from '../components/EntryTimeline/EntryTimeline.jsx';
import { Pagination } from '../components/Pagination/Pagination.jsx';
import { MoodSummaryPanel } from '../components/MoodSummaryPanel/MoodSummaryPanel.jsx';
import { ReminderBanner } from '../components/ReminderBanner/ReminderBanner.jsx';
import { ExportImportControls } from '../components/ExportImportControls/ExportImportControls.jsx';
import { MoodWeatherChart } from '../components/MoodWeatherChart/MoodWeatherChart.jsx';
import { ImageGallery } from '../components/ImageGallery/ImageGallery.jsx';
import { StreakCard } from '../components/StreakCard/StreakCard.jsx';
import { ForecastPrompt } from '../components/ForecastPrompt/ForecastPrompt.jsx';
import { OnThisDay } from '../components/OnThisDay/OnThisDay.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { useSemantic } from '../context/SemanticContext.jsx';
import { isSameDay } from '../lib/dateFormat.js';
import { highlightTerms, matchesQuery, parseQuery } from '../lib/search.js';
import { EMPTY_FILTERS, applyFilters, getFilterOptions, hasActiveFilters } from '../lib/entryFilters.js';
import styles from './Dashboard.module.css';

const ITEMS_PER_PAGE = 6;

export function Dashboard() {
  const { entries, deleteEntry, importEntries } = useEntriesContext();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [dateFilterMode, setDateFilterMode] = useState('all');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [moodPanelOpen, setMoodPanelOpen] = useState(false);
  const [semanticMode, setSemanticMode] = useState(false);
  const [meaning, setMeaning] = useState({ query: '', scores: null, state: 'idle' });
  const semantic = useSemantic();

  // These read every entry, so they're built only when the entries change,
  // not on every keystroke in search or click on a filter.
  const summaries = useMemo(
    () => (
      <>
        <StreakCard entries={entries} />
        <ForecastPrompt entries={entries} />
        <OnThisDay entries={entries} />
        <MoodWeatherChart entries={entries} />
        <ImageGallery entries={entries} />
      </>
    ),
    [entries],
  );

  const parsedQuery = useMemo(() => parseQuery(searchTerm), [searchTerm]);

  // Search by meaning: the free words (not operators like mood:) are matched
  // against the meaning index; operators still filter as usual.
  const meaningText = [...parsedQuery.words, ...parsedQuery.phrases].join(' ');
  const meaningActive = semanticMode && semantic.enabled && meaningText.length > 0;
  const { search: searchMeaning, indexedCount } = semantic;
  useEffect(() => {
    if (!meaningActive) {
      setMeaning({ query: '', scores: null, state: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setMeaning((m) => ({ ...m, state: 'loading' }));
    searchMeaning(meaningText)
      .then((hits) => {
        if (cancelled) return;
        setMeaning({ query: meaningText, scores: new Map(hits.map((h) => [h.id, h.score])), state: 'idle' });
      })
      .catch(() => {
        if (!cancelled) setMeaning({ query: '', scores: null, state: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [meaningActive, meaningText, searchMeaning, indexedCount]);
  const meaningScores = meaningActive && meaning.query === meaningText ? meaning.scores : null;

  const operatorsOnly = useMemo(() => ({ ...parsedQuery, words: [], phrases: [] }), [parsedQuery]);
  const highlight = useMemo(
    () => (meaningScores ? [] : highlightTerms(parsedQuery)),
    [parsedQuery, meaningScores],
  );

  const visibleEntries = useMemo(() => {
    let list = entries;

    if (searchTerm) {
      const query = meaningScores ? operatorsOnly : parsedQuery;
      list = list.filter((entry) => matchesQuery(entry, query));
    }
    if (meaningScores) {
      list = list.filter((entry) => meaningScores.has(String(entry.id)));
    }

    if (dateFilterMode === 'today') {
      const today = new Date();
      list = list.filter((entry) => isSameDay(entry.date, today));
    }

    list = applyFilters(list, filters);

    return [...list].sort((a, b) => {
      // Closest in meaning first, whatever the sort order says.
      if (meaningScores) return meaningScores.get(String(b.id)) - meaningScores.get(String(a.id));
      const aDate = new Date(a.date);
      const bDate = new Date(b.date);
      if (isNaN(aDate) || isNaN(bDate)) return 0;
      return sortOrder === 'oldest' ? aDate - bDate : bDate - aDate;
    });
  }, [entries, searchTerm, parsedQuery, operatorsOnly, meaningScores, dateFilterMode, filters, sortOrder]);

  const filterOptions = useMemo(() => getFilterOptions(entries), [entries]);
  const isFiltered = Boolean(searchTerm) || dateFilterMode === 'today' || hasActiveFilters(filters);

  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / ITEMS_PER_PAGE));
  const clampedPage = Math.min(currentPage, totalPages);
  const paginatedEntries = visibleEntries.slice(
    (clampedPage - 1) * ITEMS_PER_PAGE,
    clampedPage * ITEMS_PER_PAGE,
  );

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && moodPanelOpen) closeMoodPanel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [moodPanelOpen]);

  function handleSearchChange(value) {
    setSearchTerm(value.trim().toLowerCase());
    setCurrentPage(1);
  }

  function handleSortChange(value) {
    setSortOrder(value.includes('oldest') ? 'oldest' : 'newest');
  }

  function handleToggleToday() {
    setDateFilterMode((mode) => (mode === 'today' ? 'all' : 'today'));
    setCurrentPage(1);
  }

  function handleFiltersChange(next) {
    setFilters(next);
    setCurrentPage(1);
  }

  function closeMoodPanel() {
    setMoodPanelOpen(false);
    document.getElementById('moodTrackerBtn')?.focus();
  }

  function handleEdit(id) {
    navigate(`/edit/${id}`);
  }

  return (
    <>
      <Header title="Weather Journal" icon="🌥️">
        <ThemeToggle />
        <ExportImportControls entries={entries} onImport={importEntries} />
        <Button type="button" onClick={() => navigate('/new')} aria-label="Write a new journal entry">
          + Write
        </Button>
      </Header>

      <div className="container" id="main-content" role="main">
        <ReminderBanner entries={entries} />
        <SearchSortBar
          searchValue={searchTerm}
          onSearchChange={handleSearchChange}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          dateFilterMode={dateFilterMode}
          onToggleToday={handleToggleToday}
          moodPanelOpen={moodPanelOpen}
          onToggleMoodPanel={() => setMoodPanelOpen((open) => !open)}
          semanticAvailable={semantic.enabled}
          semanticMode={semanticMode}
          onToggleSemantic={() => {
            setSemanticMode((on) => !on);
            setCurrentPage(1);
          }}
        />
        <FilterChips options={filterOptions} filters={filters} onChange={handleFiltersChange} />

        {summaries}

        <h2 className={styles.heading} id="entries-heading">
          Your Journal
        </h2>
        {isFiltered && (
          <p className={styles.resultCount} role="status">
            {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}
            {meaningScores && ', closest in meaning first'}
            {meaningActive && meaning.state === 'loading' && '. Searching by meaning…'}
            {meaningActive && meaning.state === 'error' && '. Could not search by meaning, showing word matches.'}
          </p>
        )}

        <EntryTimeline
          entries={paginatedEntries}
          highlight={highlight}
          hasFilters={isFiltered}
          onEdit={handleEdit}
          onDelete={deleteEntry}
        />

        <Pagination totalPages={totalPages} currentPage={clampedPage} onPageChange={setCurrentPage} />
      </div>

      {moodPanelOpen && <MoodSummaryPanel entries={entries} onClose={closeMoodPanel} />}
    </>
  );
}
