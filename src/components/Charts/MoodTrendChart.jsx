import { useState } from 'react';
import { describeMood } from '../../lib/insights.js';
import { useChartWidth } from './useChartWidth.js';
import styles from './Charts.module.css';

const HEIGHT = 220;
const M = { top: 12, right: 16, bottom: 28, left: 64 };
const Y_TICKS = [
  { value: 2, label: 'Great' },
  { value: 0, label: 'Mixed' },
  { value: -2, label: 'Low' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekLabel(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function signed(n) {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
}

// Weekly average mood as a single 2px line on a Great–Low scale, with a gap
// for weeks without entries. A crosshair snaps to the nearest week on hover
// and on arrow keys; the table under the chart holds every value.
export function MoodTrendChart({ data }) {
  const [ref, width] = useChartWidth();
  const [active, setActive] = useState(null);

  const plotW = Math.max(width - M.left - M.right, 10);
  const plotH = HEIGHT - M.top - M.bottom;
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;
  const x = (i) => M.left + i * step;
  const y = (v) => M.top + ((2 - v) / 4) * plotH;

  // One path, broken into segments at weeks with no entries.
  let path = '';
  data.forEach((d, i) => {
    if (d.average === null) return;
    const prev = data[i - 1];
    path += `${prev && prev.average !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.average).toFixed(1)}`;
  });
  const lonely = data
    .map((d, i) => ({ d, i }))
    .filter(
      ({ d, i }) =>
        d.average !== null && data[i - 1]?.average == null && data[i + 1]?.average == null,
    );
  const lastIndex = data.map((d) => d.average !== null).lastIndexOf(true);

  // First week of each month gets an x label, thinned on narrow screens.
  const monthTicks = data
    .map((d, i) => ({ i, date: d.weekStart }))
    .filter(({ i, date }) => i === 0 || date.getMonth() !== data[i - 1].weekStart.getMonth());
  const every = Math.ceil(monthTicks.length / Math.max(1, Math.floor(plotW / 56)));

  function nearest(clientX, rect) {
    const i = Math.round((clientX - rect.left - M.left) / (step || 1));
    return Math.min(Math.max(i, 0), data.length - 1);
  }

  function handleKeyDown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setActive((i) => {
      const start = i ?? lastIndex;
      return Math.min(Math.max(start + (e.key === 'ArrowRight' ? 1 : -1), 0), data.length - 1);
    });
  }

  const point = active !== null ? data[active] : null;

  return (
    <div className={styles.chartWrap} ref={ref}>
      <svg
        width={width}
        height={HEIGHT}
        className={styles.svg}
        role="img"
        aria-label="Average mood per week. Use left and right arrow keys to read each week."
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => setActive((i) => i ?? lastIndex)}
        onBlur={() => setActive(null)}
        onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setActive(null)}
      >
        {Y_TICKS.map((t) => (
          <g key={t.value}>
            <line
              x1={M.left}
              x2={M.left + plotW}
              y1={y(t.value)}
              y2={y(t.value)}
              className={t.value === 0 ? styles.baseline : styles.grid}
            />
            <text x={M.left - 8} y={y(t.value)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
              {t.label}
            </text>
          </g>
        ))}

        {monthTicks.map(({ i, date }, n) =>
          n % every === 0 ? (
            <text key={i} x={x(i)} y={HEIGHT - 8} className={styles.axisLabel} textAnchor="middle">
              {MONTHS[date.getMonth()]}
            </text>
          ) : null,
        )}

        <path d={path} className={styles.line} />
        {lonely.map(({ d, i }) => (
          <circle key={i} cx={x(i)} cy={y(d.average)} r={3} className={styles.dot} />
        ))}
        {lastIndex >= 0 && (
          <circle cx={x(lastIndex)} cy={y(data[lastIndex].average)} r={5} className={styles.endDot} />
        )}

        {point && (
          <g aria-hidden="true">
            <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} className={styles.crosshair} />
            {point.average !== null && (
              <circle cx={x(active)} cy={y(point.average)} r={5} className={styles.endDot} />
            )}
          </g>
        )}
      </svg>

      {point && (
        <div
          className={styles.tooltip}
          style={{ left: Math.min(Math.max(x(active), 80), width - 80), top: M.top }}
          role="status"
        >
          <strong>
            {point.average === null ? 'No entries' : `${describeMood(point.average)} (${signed(point.average)})`}
          </strong>
          <span>
            Week of {weekLabel(point.weekStart)}
            {point.count ? ` · ${point.count} ${point.count === 1 ? 'entry' : 'entries'}` : ''}
          </span>
        </div>
      )}

      <details className={styles.tableToggle}>
        <summary>View as table</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Week of</th>
              <th scope="col">Mood</th>
              <th scope="col">Entries</th>
            </tr>
          </thead>
          <tbody>
            {data
              .filter((d) => d.count > 0)
              .map((d) => (
                <tr key={d.weekStart.toISOString()}>
                  <td>{weekLabel(d.weekStart)}</td>
                  <td>
                    {describeMood(d.average)} ({signed(d.average)})
                  </td>
                  <td>{d.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
