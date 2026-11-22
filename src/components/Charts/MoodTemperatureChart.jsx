import { useState } from 'react';
import { useChartWidth } from './useChartWidth.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './Charts.module.css';

const ROW_H = 36;
const M = { top: 8, right: 112, bottom: 28, left: 112 };

function niceStep(span) {
  return span <= 12 ? 2 : span <= 30 ? 5 : 10;
}

// One dot per mood at its average temperature (a dot plot, so cold days
// below 0°C read as naturally as warm ones). Each row is directly labeled
// with its value, so nothing is hidden behind hover; hovering a row lifts
// its dot.
export function MoodTemperatureChart({ data }) {
  const { t, tOr } = useI18n();
  const [ref, width] = useChartWidth();
  const [active, setActive] = useState(null);

  const temps = data.map((d) => d.averageTemp);
  const step = niceStep(Math.max(...temps) - Math.min(...temps));
  const lo = Math.floor((Math.min(...temps) - 1) / step) * step;
  const hi = Math.ceil((Math.max(...temps) + 1) / step) * step;
  const ticks = [];
  for (let tick = lo; tick <= hi; tick += step) ticks.push(tick);

  const plotW = Math.max(width - M.left - M.right, 10);
  const height = M.top + data.length * ROW_H + M.bottom;
  const x = (t) => M.left + ((t - lo) / (hi - lo || 1)) * plotW;
  const rowY = (i) => M.top + i * ROW_H + ROW_H / 2;

  return (
    <div className={styles.chartWrap} ref={ref}>
      <svg width={width} height={height} className={styles.svg} aria-hidden="true">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={M.top} y2={height - M.bottom} className={styles.grid} />
            <text x={x(tick)} y={height - 8} className={styles.axisLabel} textAnchor="middle">
              {tick}°
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.mood}>
            <line x1={M.left} x2={M.left + plotW} y1={rowY(i)} y2={rowY(i)} className={styles.track} />
            <circle
              cx={x(d.averageTemp)}
              cy={rowY(i)}
              r={active === i ? 7 : 5}
              className={styles.endDot}
            />
          </g>
        ))}
      </svg>

      {/* The rows are real HTML on top of the plot: readable labels, and a
          hover target the full width of the row. */}
      <ul className={styles.rows} style={{ top: M.top }}>
        {data.map((d, i) => (
          <li
            key={d.mood}
            className={styles.row}
            style={{ height: ROW_H }}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
          >
            <span className={styles.rowLabel} style={{ width: M.left - 12 }}>
              <span aria-hidden="true">{d.emoji}</span> {tOr(`mood.${d.mood}`, d.mood)}
            </span>
            <span className={styles.rowValue} style={{ width: M.right - 12 }}>
              <strong>{Math.round(d.averageTemp)}°C</strong>{' '}
              <span>· {t('chart.days', { count: d.count })}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
