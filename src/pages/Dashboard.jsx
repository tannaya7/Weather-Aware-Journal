import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header/Header.jsx';
import { Button } from '../components/Button/Button.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { SearchSortBar } from '../components/SearchSortBar/SearchSortBar.jsx';
import { EntryTimeline } from '../components/EntryTimeline/EntryTimeline.jsx';
import { Pagination } from '../components/Pagination/Pagination.jsx';
import { MoodSummaryPanel } from '../components/MoodSummaryPanel/MoodSummaryPanel.jsx';
import { ExportImportControls } from '../components/ExportImportControls/ExportImportControls.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { isSameDay } from '../lib/dateFormat.js';
import { getEntryTitle } from '../lib/entryTitle.js';
import styles from './Dashboard.module.css';

const ITEMS_PER_PAGE = 6;

export function Dashboard() {
  const { entries, deleteEntry, importEntries } = useEntriesContext();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [dateFilterMode, setDateFilterMode] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [moodPanelOpen, setMoodPanelOpen] = useState(false);

  const visibleEntries = useMemo(() => {
    let list = entries;

    if (searchTerm) {
      list = list.filter((entry) => {
        const haystack = [getEntryTitle(entry), entry.content, entry.mood, ...(entry.tags || [])]
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchTerm);
      });
    }

    if (dateFilterMode === 'today') {
      const today = new Date();
      list = list.filter((entry) => isSameDay(entry.date, today));
    }

    return [...list].sort((a, b) => {
      const aDate = new Date(a.date);
      const bDate = new Date(b.date);
      if (isNaN(aDate) || isNaN(bDate)) return 0;
      return sortOrder === 'oldest' ? aDate - bDate : bDate - aDate;
    });
  }, [entries, searchTerm, dateFilterMode, sortOrder]);

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
        <SearchSortBar
          searchValue={searchTerm}
          onSearchChange={handleSearchChange}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          dateFilterMode={dateFilterMode}
          onToggleToday={handleToggleToday}
          moodPanelOpen={moodPanelOpen}
          onToggleMoodPanel={() => setMoodPanelOpen((open) => !open)}
        />

        <h2 className={styles.heading} id="entries-heading">
          Your Journal
        </h2>

        <EntryTimeline
          entries={paginatedEntries}
          hasFilters={Boolean(searchTerm) || dateFilterMode === 'today'}
          onEdit={handleEdit}
          onDelete={deleteEntry}
        />

        <Pagination totalPages={totalPages} currentPage={clampedPage} onPageChange={setCurrentPage} />
      </div>

      {moodPanelOpen && <MoodSummaryPanel entries={entries} onClose={closeMoodPanel} />}
    </>
  );
}
