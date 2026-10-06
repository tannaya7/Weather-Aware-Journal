import { describeMood } from '../../lib/insights.js';
import { useChartWidth } from './useChartWidth.js';
import styles from './Charts.module.css';

const ROW_H = 40;
const M = { top: 8, right: 16, bottom: 28, left: 150 };
const TICKS = [
  { value: -2, label: 'Low' },
  { value: 0, label: 'Mixed' },
  { value: 2, label: 'Great' },
];

function signed(n) {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
}

// Average mood per row, as dots on a Low–Great line. Position carries the
// value, so one hue is enough. A row can have two points (habits: days
// with vs. without); the second is drawn hollow, and a legend says which
// is which. Every value is in the table view under the chart.
export function MoodDotRows({ rows, legend }) {
  const [ref, width] = useChartWidth();
  const plotW = Math.max(width - M.left - M.right, 10);
  const height = M.top + rows.length * ROW_H + M.bottom;
  const x = (v) => M.left + ((v + 2) / 4) * plotW;
  const rowY = (i) => M.top + i * ROW_H + ROW_H / 2;

  return (
    <div className={styles.chartWrap} ref={ref}>
      {legend && (
        <ul className={styles.legend}>
          {legend.map((item) => (
            <li key={item.kind}>
              <svg width="12" height="12" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" className={item.kind === 'hollow' ? styles.hollowDot : styles.endDot} />
              </svg>
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <svg width={width} height={height} className={styles.svg} aria-hidden="true">
        {TICKS.map((t) => (
          <g key={t.value}>
            <line
              x1={x(t.value)}
              x2={x(t.value)}
              y1={M.top}
              y2={height - M.bottom}
              className={t.value === 0 ? styles.baseline : styles.grid}
            />
            <text x={x(t.value)} y={height - 8} className={styles.axisLabel} textAnchor="middle">
              {t.label}
            </text>
          </g>
        ))}
        {rows.map((row, i) => {
          const [a, b] = row.points;
          return (
            <g key={row.key}>
              {b && (
                <line x1={x(a.average)} x2={x(b.average)} y1={rowY(i)} y2={rowY(i)} className={styles.connector} />
              )}
              {b && <circle cx={x(b.average)} cy={rowY(i)} r={5} className={styles.hollowDot} />}
              <circle cx={x(a.average)} cy={rowY(i)} r={5} className={styles.endDot} />
            </g>
          );
        })}
      </svg>
      <ul className={styles.rows} style={{ top: M.top + (legend ? 28 : 0) }} aria-hidden="true">
        {rows.map((row) => (
          <li key={row.key} className={styles.dotRow} style={{ height: ROW_H, width: M.left - 12 }}>
            {row.label}
          </li>
        ))}
      </ul>

      <details className={styles.tableToggle}>
        <summary>View as table</summary>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{legend ? 'Habit' : 'When'}</th>
              {legend && <th scope="col">Days</th>}
              <th scope="col">Mood</th>
              <th scope="col">Entries</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((row) =>
              row.points.map((p, i) => (
                <tr key={`${row.key}-${i}`}>
                  <td>{row.label}</td>
                  {legend && <td>{p.name}</td>}
                  <td>
                    {describeMood(p.average)} ({signed(p.average)})
                  </td>
                  <td>{p.days}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </details>
    </div>
  );
}
