import { useMemo, useState } from 'react';
import { Header } from '../components/Header/Header.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { MiniMonth } from '../components/MiniMonth/MiniMonth.jsx';
import { YearlyMoodBarGraph } from '../components/YearlyMoodBarGraph/YearlyMoodBarGraph.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { buildDayMoodMap, computeYearlyMoodCounts } from '../lib/calendarStats.js';
import styles from './Calendar.module.css';

export function Calendar() {
  const { entries } = useEntriesContext();
  const [year, setYear] = useState(() => new Date().getFullYear());

  const dayMoodMap = useMemo(() => buildDayMoodMap(entries), [entries]);
  const yearlyMoodCounts = useMemo(
    () => computeYearlyMoodCounts(entries, year),
    [entries, year],
  );

  return (
    <>
      <Header title="Calendar" icon="📅">
        <ThemeToggle />
      </Header>

      <div className={`container ${styles.page}`} id="main-content" role="main">
        <div className={styles.yearNav}>
          <button
            type="button"
            className={styles.yearBtn}
            onClick={() => setYear((y) => y - 1)}
            aria-label="Previous year"
          >
            ←
          </button>
          <span className={styles.yearLabel}>{year}</span>
          <button
            type="button"
            className={styles.yearBtn}
            onClick={() => setYear((y) => y + 1)}
            aria-label="Next year"
          >
            →
          </button>
        </div>

        <div className={styles.months}>
          {Array.from({ length: 12 }, (_, month) => (
            <MiniMonth key={month} year={year} month={month} dayMoodMap={dayMoodMap} />
          ))}
        </div>

        <div className={styles.summaryCard}>
          <h2 className={styles.summaryHeading}>Moods in {year}</h2>
          <YearlyMoodBarGraph data={yearlyMoodCounts} />
        </div>
      </div>
    </>
  );
}
