import { useMemo } from 'react';
import { analyzeCorrelations, dataCoverage, MIN_PAIRS } from '../../lib/correlations.js';
import styles from './Patterns.module.css';

function signed(n) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
}

function Finding({ result }) {
  const { factor, lag, rho, ci, n, strength, confidence, summary } = result;
  return (
    <li className={styles.finding}>
      <p className={styles.summary}>
        {factor.emoji ? `${factor.emoji} ` : ''}
        {summary}
      </p>
      <p className={styles.meta}>
        <span className={styles.badge} data-confidence={confidence}>
          {confidence === 'clear' ? 'Clear pattern' : 'Possible pattern'}
        </span>{' '}
        {strength} {rho > 0 ? 'positive' : 'negative'} link · ρ {signed(rho)} (95% range {signed(ci[0])} to{' '}
        {signed(ci[1])}) · {n} days{lag === 1 ? ' · compares each day with the one before' : ''}
      </p>
    </li>
  );
}

// Which weather, sky, and habit factors tend to move with mood, from your
// own entries. Honest about uncertainty: needs enough days, corrects for
// testing many things at once, and says what it did not find.
export function Patterns({ entries, habits }) {
  const results = useMemo(() => analyzeCorrelations(entries, { habits }), [entries, habits]);
  const coverage = useMemo(() => dataCoverage(entries), [entries]);

  const found = results.filter((r) => r.confidence !== 'none');
  const quiet = results.filter((r) => r.confidence === 'none');

  return (
    <section className={styles.card} aria-labelledby="patterns-heading">
      <h2 id="patterns-heading" className={styles.heading}>
        What moves your mood
      </h2>
      <p className={styles.sub}>
        Weather, sky, and habit patterns found in your own entries. These show what tends to go
        together, not what causes what.
      </p>

      {!coverage.enough ? (
        <p className={styles.empty}>
          Log a mood on at least {MIN_PAIRS} different days to look for patterns. You have{' '}
          {coverage.moodDays}.
        </p>
      ) : found.length > 0 ? (
        <ul className={styles.list}>
          {found.map((r) => (
            <Finding key={`${r.factor.id}-${r.lag}`} result={r} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          No clear patterns yet. That is a real result: with {coverage.moodDays} days of data,
          nothing stands out from chance.
        </p>
      )}

      {coverage.enough && quiet.length > 0 && (
        <details className={styles.quiet}>
          <summary>Checked, nothing clear ({quiet.length})</summary>
          <ul className={styles.quietList}>
            {quiet.map((r) => (
              <li key={`${r.factor.id}-${r.lag}`}>
                {r.factor.emoji ? `${r.factor.emoji} ` : ''}
                {r.factor.name}
                {r.lag === 1 ? ' (day before)' : ''}: ρ {signed(r.rho)}, {r.n} days
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
