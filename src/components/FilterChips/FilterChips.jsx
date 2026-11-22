import { emojiForMood } from '../../lib/moods.js';
import { iconForType } from '../../lib/weatherApi.js';
import { EMPTY_FILTERS, hasActiveFilters, toggleFilter } from '../../lib/entryFilters.js';
import { useI18n } from '../../i18n/I18nContext.jsx';
import styles from './FilterChips.module.css';

function ChipGroup({ label, shortLabel, children }) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <span className={styles.groupLabel} aria-hidden="true">
        {shortLabel}
      </span>
      {children}
    </div>
  );
}

function Chip({ pressed, onClick, children }) {
  return (
    <button type="button" className={styles.chip} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

// Toggle chips for narrowing the timeline by mood, weather, and tag. Only
// values some entry actually uses are offered (see getFilterOptions).
export function FilterChips({ options, filters, onChange }) {
  const { t, tOr } = useI18n();
  const { moods, weather, tags } = options;
  if (moods.length === 0 && weather.length === 0 && tags.length === 0) return null;

  const toggle = (group, value) => onChange(toggleFilter(filters, group, value));

  return (
    <div className={styles.filters}>
      {moods.length > 0 && (
        <ChipGroup label={t('filters.mood')} shortLabel={t('filters.moodShort')}>
          {moods.map((mood) => (
            <Chip key={mood} pressed={filters.moods.includes(mood)} onClick={() => toggle('moods', mood)}>
              <span aria-hidden="true">{emojiForMood(mood)}</span> {tOr(`mood.${mood}`, mood)}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {weather.length > 0 && (
        <ChipGroup label={t('filters.weather')} shortLabel={t('filters.weatherShort')}>
          {weather.map((type) => (
            <Chip
              key={type}
              pressed={filters.weather.includes(type)}
              onClick={() => toggle('weather', type)}
            >
              <span aria-hidden="true">{iconForType(type)}</span> {tOr(`weather.${type}`, type)}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {tags.length > 0 && (
        <ChipGroup label={t('filters.tag')} shortLabel={t('filters.tagShort')}>
          {tags.map(({ key, label }) => (
            <Chip key={key} pressed={filters.tags.includes(key)} onClick={() => toggle('tags', key)}>
              #{label}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {hasActiveFilters(filters) && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          {t('filters.clear')}
        </button>
      )}
    </div>
  );
}
