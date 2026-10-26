import { describe, expect, it } from 'vitest';
import { matchesQuery, parseQuery, relatedEntries } from '../../src/lib/search.js';
import { moodByFactor, moodByTemperature, weeklyMoodTrend, withMoonFraction } from '../../src/lib/insights.js';
import { applyFilters, getFilterOptions } from '../../src/lib/entryFilters.js';
import { computeStreaks } from '../../src/lib/streaks.js';
import { groupByPlace } from '../../src/lib/mapPlaces.js';
import { habitMoodEffects, DEFAULT_HABITS } from '../../src/lib/habits.js';
import { yearSummary } from '../../src/lib/yearReview.js';

const MOODS = ['Happy', 'Peaceful', 'Sad', 'Excited', 'Angry', 'Anxious'];
const WEATHER = ['Clear sky', 'Clouds', 'Rain', 'Fog', 'Snow'];
const WORDS = 'walk rain coffee work friends park river book music dinner tired sunny quiet busy family'.split(' ');

// About 14 years of daily entries.
function makeJournal(count) {
  const start = Date.UTC(2012, 0, 1);
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    date: new Date(start + i * 86400000).toISOString(),
    content: `# Day ${i}\n${Array.from({ length: 40 }, (_, j) => WORDS[(i * 7 + j) % WORDS.length]).join(' ')}\n- [ ] something`,
    mood: MOODS[i % MOODS.length],
    weatherType: WEATHER[i % WEATHER.length],
    temperature: `${(i % 35) - 5}°C`,
    daylightHours: 9 + (i % 7),
    airQuality: (i * 13) % 160,
    tags: [WORDS[i % WORDS.length], WORDS[(i + 3) % WORDS.length]],
    latitude: 17 + (i % 20) / 10,
    longitude: 78 + (i % 20) / 10,
    locationName: `Place ${i % 20}`,
    habits: { sleep: 5 + (i % 5), exercise: i % 2 === 0 },
  }));
}

function time(fn) {
  const t0 = performance.now();
  const result = fn();
  return { result, ms: performance.now() - t0 };
}

// Generous budgets (the real numbers are far lower): these catch an
// accidental O(n²), not small slowdowns.
describe('with 5,000 entries', () => {
  const journal = makeJournal(5000);

  it('searches fast enough to run on every keystroke', () => {
    // The first keystroke builds each entry's cached search text; later
    // keystrokes reuse it, and those are what has to feel instant.
    const first = parseQuery('w');
    journal.forEach((e) => matchesQuery(e, first));
    for (const q of ['rain', 'rain park -"place 3"', '"coffee work" mood:happy', 'tag:music after:2020 has:location']) {
      const parsed = parseQuery(q);
      const { result, ms } = time(() => journal.filter((e) => matchesQuery(e, parsed)));
      expect(result.length).toBeGreaterThan(0);
      expect(ms).toBeLessThan(400);
    }
  });

  it('filters and builds filter chips quickly', () => {
    const { ms: optionsMs } = time(() => getFilterOptions(journal));
    const { result, ms } = time(() => applyFilters(journal, { moods: ['Sad'], weather: ['Rain'], tags: [] }));
    expect(result.length).toBeGreaterThan(0);
    expect(optionsMs + ms).toBeLessThan(400);
  });

  it('computes every Insights and dashboard summary quickly', () => {
    const { ms } = time(() => {
      weeklyMoodTrend(journal, { weeks: 52, now: new Date(Date.UTC(2025, 6, 1)) });
      moodByTemperature(journal);
      moodByFactor(journal, 'daylight');
      moodByFactor(journal, 'air');
      moodByFactor(journal, 'moon', withMoonFraction);
      habitMoodEffects(journal, DEFAULT_HABITS);
      computeStreaks(journal);
      groupByPlace(journal);
      yearSummary(journal, 2020);
    });
    expect(ms).toBeLessThan(1500);
  });

  it('finds related entries quickly', () => {
    const { result, ms } = time(() => relatedEntries(journal[100], journal));
    expect(result).toHaveLength(3);
    expect(ms).toBeLessThan(1500);
  });
});
