import { compareWithPrevious, formatDay } from '../../lib/periodReview.js';
import styles from './PeriodReview.module.css';

function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// The facts of a review as a definition list. `paper` is for the printed
// sheet, where the colors are fixed (ink on white) in both themes.
export function PeriodFacts({ summary, paper = false }) {
  const trend = compareWithPrevious(summary);
  const rows = [
    ['Entries', summary.entries],
    ['Days written', summary.daysWritten],
    ['Words', summary.words.toLocaleString()],
  ];
  if (summary.averageMood) rows.push(['Average mood', summary.averageMood.label + (trend ? ` · ${trend}` : '')]);
  if (summary.bestDay) rows.push(['Best day', `${formatDay(summary.bestDay.date)} · ${summary.bestDay.label}`]);
  if (summary.hardestDay) rows.push(['Hardest day', `${formatDay(summary.hardestDay.date)} · ${summary.hardestDay.label}`]);
  if (summary.topWeather) {
    rows.push(['Most common weather', `${summary.topWeather.icon} ${summary.topWeather.type} (${count(summary.topWeather.count, 'entry', 'entries')})`]);
  }
  if (summary.temperatureRange) {
    rows.push(['Temperature', `${Math.round(summary.temperatureRange.min)}° to ${Math.round(summary.temperatureRange.max)}°C`]);
  }
  for (const g of summary.goals) {
    rows.push([`${g.habit.emoji} ${g.habit.name} goal`, `${g.met} of ${g.target} days${g.achieved ? ', reached' : ''}`]);
  }

  return (
    <dl className={paper ? styles.paperFacts : styles.facts}>
      {rows.map(([term, detail]) => (
        <div key={term} className={styles.fact}>
          <dt>{term}</dt>
          <dd>{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
