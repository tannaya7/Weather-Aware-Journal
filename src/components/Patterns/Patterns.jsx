import { useMemo } from 'react';
import { analyzeCorrelations, dataCoverage, MIN_PAIRS } from '../../lib/correlations.js';
import { habitName } from '../HabitFields/HabitFields.jsx';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './Patterns.module.css';

function signed(n) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
}

// A factor's name in the app's language: built-in ones are translated,
// habits go through habitName (people's own names stay as written).
function factorName(factor, tOr) {
  if (factor.id.startsWith('habit-')) return habitName({ ...factor, id: factor.id.slice('habit-'.length) }, tOr);
  return tOr(`factor.${factor.id}`, factor.name);
}

function summaryOf(result, t, tOr) {
  const { factor, lag, rho } = result;
  const key = `patterns.${factor.kind === 'flag' ? 'flag' : 'number'}.${lag === 1 ? 1 : 0}.${rho > 0 ? 'higher' : 'lower'}`;
  return t(key, { name: factorName(factor, tOr).toLowerCase() });
}

function Finding({ result }) {
  const { t, tOr } = useI18n();
  const { factor, lag, rho, ci, n, strength, confidence } = result;
  return (
    <li className={styles.finding}>
      <p className={styles.summary}>
        {factor.emoji ? `${factor.emoji} ` : ''}
        {summaryOf(result, t, tOr)}
      </p>
      <p className={styles.meta}>
        <span className={styles.badge} data-confidence={confidence}>
          {t(confidence === 'clear' ? 'patterns.clear' : 'patterns.possible')}
        </span>{' '}
        {t('patterns.link', {
          strength: t(`patterns.strength.${strength}`),
          sign: t(rho > 0 ? 'patterns.positive' : 'patterns.negative'),
        })}{' '}
        · ρ {signed(rho)} ({t('patterns.range', { low: signed(ci[0]), high: signed(ci[1]) })}) ·{' '}
        {t('patterns.days', { count: n })}
        {lag === 1 ? ` · ${t('patterns.dayBefore')}` : ''}
      </p>
    </li>
  );
}

// Which weather, sky, and habit factors tend to move with mood, from your
// own entries. Honest about uncertainty: needs enough days, corrects for
// testing many things at once, and says what it did not find.
export function Patterns({ entries, habits }) {
  const { t, tOr } = useI18n();
  const results = useMemo(() => analyzeCorrelations(entries, { habits }), [entries, habits]);
  const coverage = useMemo(() => dataCoverage(entries), [entries]);

  const found = results.filter((r) => r.confidence !== 'none');
  const quiet = results.filter((r) => r.confidence === 'none');

  return (
    <section className={styles.card} aria-labelledby="patterns-heading">
      <h2 id="patterns-heading" className={styles.heading}>
        {t('patterns.heading')}
      </h2>
      <p className={styles.sub}>{t('patterns.sub')}</p>

      {!coverage.enough ? (
        <p className={styles.empty}>{t('patterns.notEnough', { needed: MIN_PAIRS, have: coverage.moodDays })}</p>
      ) : found.length > 0 ? (
        <ul className={styles.list}>
          {found.map((r) => (
            <Finding key={`${r.factor.id}-${r.lag}`} result={r} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{t('patterns.none', { count: coverage.moodDays })}</p>
      )}

      {coverage.enough && quiet.length > 0 && (
        <details className={styles.quiet}>
          <summary>{t('patterns.checked', { count: quiet.length })}</summary>
          <ul className={styles.quietList}>
            {quiet.map((r) => (
              <li key={`${r.factor.id}-${r.lag}`}>
                {r.factor.emoji ? `${r.factor.emoji} ` : ''}
                {factorName(r.factor, tOr)}
                {r.lag === 1 ? t('patterns.dayBeforeShort') : ''}: ρ {signed(r.rho)}, {t('patterns.days', { count: r.n })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
