import { useMemo, useState } from 'react';
import { Header } from '../components/Header/Header.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { MoodTrendChart } from '../components/Charts/MoodTrendChart.jsx';
import { MoodTemperatureChart } from '../components/Charts/MoodTemperatureChart.jsx';
import { OnThisDay } from '../components/OnThisDay/OnThisDay.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { moodByTemperature, weeklyMoodTrend } from '../lib/insights.js';
import { emojiForMood } from '../lib/moods.js';
import styles from './Insights.module.css';

const RANGES = [
  { weeks: 12, label: '3 months' },
  { weeks: 26, label: '6 months' },
  { weeks: 52, label: '1 year' },
];

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best;
}

function StatTile({ label, value, detail }) {
  return (
    <div className={styles.tile}>
      <p className={styles.tileLabel}>{label}</p>
      <p className={styles.tileValue}>{value}</p>
      {detail && <p className={styles.tileDetail}>{detail}</p>}
    </div>
  );
}

export function Insights() {
  const { entries } = useEntriesContext();
  const [weeks, setWeeks] = useState(26);

  const trend = useMemo(() => weeklyMoodTrend(entries, { weeks }), [entries, weeks]);
  const byTemp = useMemo(() => moodByTemperature(entries), [entries]);
  const topMood = mostCommon(entries.map((e) => e.mood));
  const topWeather = mostCommon(entries.map((e) => e.weatherType));
  const daysWritten = new Set(
    entries.filter((e) => e.date && !isNaN(new Date(e.date))).map((e) => new Date(e.date).toDateString()),
  ).size;
  const hasTrend = trend.some((d) => d.count > 0);

  return (
    <>
      <Header title="Insights" icon="📈">
        <ThemeToggle />
      </Header>

      <div className={`container ${styles.page}`} id="main-content" role="main">
        {entries.length === 0 ? (
          <p className={styles.empty}>Write a few entries and your patterns will show up here.</p>
        ) : (
          <>
            <div className={styles.tiles}>
              <StatTile label="Entries" value={entries.length.toLocaleString()} />
              <StatTile label="Days written" value={daysWritten.toLocaleString()} />
              {topMood && (
                <StatTile
                  label="Most common mood"
                  value={`${emojiForMood(topMood.value)} ${topMood.value}`}
                  detail={`${topMood.count} ${topMood.count === 1 ? 'entry' : 'entries'}`}
                />
              )}
              {topWeather && (
                <StatTile
                  label="Most common weather"
                  value={topWeather.value}
                  detail={`${topWeather.count} ${topWeather.count === 1 ? 'entry' : 'entries'}`}
                />
              )}
            </div>

            <OnThisDay entries={entries} />

            <section className={styles.card} aria-labelledby="trend-heading">
              <div className={styles.cardHead}>
                <h2 id="trend-heading" className={styles.heading}>
                  Mood over time
                </h2>
                <div className={styles.ranges} role="group" aria-label="Time range">
                  {RANGES.map((r) => (
                    <button
                      key={r.weeks}
                      type="button"
                      className={styles.range}
                      aria-pressed={weeks === r.weeks}
                      onClick={() => setWeeks(r.weeks)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className={styles.sub}>Weekly average of the moods you logged</p>
              {hasTrend ? (
                <MoodTrendChart data={trend} />
              ) : (
                <p className={styles.empty}>No entries with a mood in this period.</p>
              )}
            </section>

            <section className={styles.card} aria-labelledby="temp-heading">
              <h2 id="temp-heading" className={styles.heading}>
                Mood and temperature
              </h2>
              <p className={styles.sub}>Average temperature on days with each mood</p>
              {byTemp.length > 0 ? (
                <MoodTemperatureChart data={byTemp} />
              ) : (
                <p className={styles.empty}>Add weather to a few entries with a mood to see this.</p>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
