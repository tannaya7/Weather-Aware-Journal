import { useMemo, useState } from 'react';
import { Header } from '../components/Header/Header.jsx';
import { ThemeToggle } from '../components/ThemeToggle/ThemeToggle.jsx';
import { MoodTrendChart } from '../components/Charts/MoodTrendChart.jsx';
import { MoodTemperatureChart } from '../components/Charts/MoodTemperatureChart.jsx';
import { MoodDotRows } from '../components/Charts/MoodDotRows.jsx';
import { OnThisDay } from '../components/OnThisDay/OnThisDay.jsx';
import { useEntriesContext } from '../context/EntriesContext.jsx';
import { moodByFactor, moodByTemperature, weeklyMoodTrend, withMoonFraction } from '../lib/insights.js';
import { enabledHabits, habitMoodEffects } from '../lib/habits.js';
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
  const { entries, habitConfig } = useEntriesContext();
  const [weeks, setWeeks] = useState(26);

  const trend = useMemo(() => weeklyMoodTrend(entries, { weeks }), [entries, weeks]);
  const byTemp = useMemo(() => moodByTemperature(entries), [entries]);
  const topMood = mostCommon(entries.map((e) => e.mood));
  const topWeather = mostCommon(entries.map((e) => e.weatherType));
  const daysWritten = new Set(
    entries.filter((e) => e.date && !isNaN(new Date(e.date))).map((e) => new Date(e.date).toDateString()),
  ).size;
  const hasTrend = trend.some((d) => d.count > 0);

  // A factor is worth showing once at least two of its buckets have entries.
  const factors = useMemo(
    () =>
      [
        { key: 'daylight', title: 'Hours of daylight' },
        { key: 'air', title: 'Air quality' },
        { key: 'moon', title: 'Moon phase' },
      ]
        .map((f) => ({ ...f, rows: moodByFactor(entries, f.key, withMoonFraction) }))
        .filter((f) => f.rows.length >= 2),
    [entries],
  );
  const habitEffects = useMemo(
    () => habitMoodEffects(entries, enabledHabits(habitConfig)),
    [entries, habitConfig],
  );

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

            <section className={styles.card} aria-labelledby="sky-heading">
              <h2 id="sky-heading" className={styles.heading}>
                Sun, air, and moon
              </h2>
              <p className={styles.sub}>Average mood by the day&apos;s daylight, air quality, and moon</p>
              {factors.length > 0 ? (
                factors.map((f) => (
                  <div key={f.key} className={styles.factor}>
                    <h3 className={styles.factorHeading}>{f.title}</h3>
                    <MoodDotRows
                      rows={f.rows.map((r) => ({
                        key: r.label,
                        label: r.label,
                        points: [{ average: r.average, days: r.count }],
                      }))}
                    />
                  </div>
                ))
              ) : (
                <p className={styles.empty}>
                  Entries with weather from a place now also save daylight and air quality. Once a
                  few have a mood, the patterns show here.
                </p>
              )}
            </section>

            <section className={styles.card} aria-labelledby="habits-heading">
              <h2 id="habits-heading" className={styles.heading}>
                Habits and mood
              </h2>
              <p className={styles.sub}>
                Average mood on days you did more vs. less of each habit. This shows what tends to go
                together, not what causes what.
              </p>
              {habitEffects.length > 0 ? (
                <MoodDotRows
                  legend={[
                    { kind: 'filled', label: 'Days with / more' },
                    { kind: 'hollow', label: 'Days without / less' },
                  ]}
                  rows={habitEffects.map((e) => ({
                    key: e.habit.id,
                    label: `${e.habit.emoji} ${e.habit.name}`,
                    points: [
                      { name: e.high.label, average: e.high.average, days: e.high.days },
                      { name: e.low.label, average: e.low.average, days: e.low.days },
                    ],
                  }))}
                />
              ) : (
                <p className={styles.empty}>
                  Log habits with a mood on at least 3 days each way (with and without, or more and
                  less), and the comparison shows here.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
