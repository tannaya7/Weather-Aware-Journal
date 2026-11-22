import { useMemo } from 'react';
import { describeMood } from '../../lib/insights.js';
import { moodOutlook } from '../../lib/moodOutlook.js';
import { weekdayNameLong } from '../../lib/dateFormat.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './MoodOutlook.module.css';

function barPercent(average) {
  return Math.round(((average + 2) / 4) * 100); // scores run from -2 to +2
}

// Direction of mood and the weekday rhythm, with a "tomorrow" tendency only
// when it beats just using your overall average.
export function MoodOutlook({ entries, today }) {
  const { t, tOr, language } = useI18n();
  const outlook = useMemo(() => moodOutlook(entries, today), [entries, today]);
  const moodWord = (average) => tOr(`moodScore.${describeMood(average)}`, describeMood(average));
  const dayName = (index) => weekdayNameLong(index, language);

  return (
    <section className={styles.card} aria-labelledby="outlook-heading">
      <h2 id="outlook-heading" className={styles.heading}>
        {t('outlook.heading')}
      </h2>
      {!outlook.enough ? (
        <p className={styles.empty}>{t('outlook.notEnough', { needed: outlook.needed, have: outlook.moodDays })}</p>
      ) : (
        <>
          <p className={styles.trend}>{t(`outlook.${outlook.trend.direction}`)}</p>

          {outlook.tomorrow ? (
            <p className={styles.tomorrow}>
              <strong>{t('outlook.tomorrow', { weekday: dayName(outlook.tomorrow.index) })}</strong>{' '}
              {t('outlook.tendsTo')} <strong>{moodWord(outlook.tomorrow.expected).toLowerCase()}</strong>{' '}
              {t('outlook.basedOn', { count: outlook.tomorrow.basedOn, weekday: dayName(outlook.tomorrow.index) })}
            </p>
          ) : (
            <p className={styles.sub}>{t('outlook.noPattern')}</p>
          )}

          <h3 className={styles.sectionHeading}>{t('outlook.byWeekday')}</h3>
          <ul className={styles.days}>
            {outlook.weekdays.map((w) => (
              <li key={w.weekday} className={styles.day}>
                <span className={styles.dayName}>{dayName(w.index)}</span>
                {w.average === null ? (
                  <span className={styles.dayNone}>{moodWord(null)}</span>
                ) : (
                  <>
                    <span
                      className={styles.track}
                      role="img"
                      aria-label={t('outlook.dayBar', { label: moodWord(w.average), count: w.days })}
                    >
                      <span className={styles.fill} style={{ width: `${barPercent(w.average)}%` }} />
                    </span>
                    <span className={styles.dayValue}>
                      {moodWord(w.average)} <span className={styles.count}>({w.days})</span>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
