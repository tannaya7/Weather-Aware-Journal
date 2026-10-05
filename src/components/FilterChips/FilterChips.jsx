import { emojiForMood } from '../../lib/moods.js';
import { iconForType } from '../../lib/weatherApi.js';
import { EMPTY_FILTERS, hasActiveFilters, toggleFilter } from '../../lib/entryFilters.js';
import styles from './FilterChips.module.css';

function ChipGroup({ label, children }) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <span className={styles.groupLabel} aria-hidden="true">
        {label.replace('Filter by ', '')}
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
  const { moods, weather, tags } = options;
  if (moods.length === 0 && weather.length === 0 && tags.length === 0) return null;

  const toggle = (group, value) => onChange(toggleFilter(filters, group, value));

  return (
    <div className={styles.filters}>
      {moods.length > 0 && (
        <ChipGroup label="Filter by mood">
          {moods.map((mood) => (
            <Chip key={mood} pressed={filters.moods.includes(mood)} onClick={() => toggle('moods', mood)}>
              <span aria-hidden="true">{emojiForMood(mood)}</span> {mood}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {weather.length > 0 && (
        <ChipGroup label="Filter by weather">
          {weather.map((type) => (
            <Chip
              key={type}
              pressed={filters.weather.includes(type)}
              onClick={() => toggle('weather', type)}
            >
              <span aria-hidden="true">{iconForType(type)}</span> {type}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {tags.length > 0 && (
        <ChipGroup label="Filter by tag">
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
          Clear filters
        </button>
      )}
    </div>
  );
}
