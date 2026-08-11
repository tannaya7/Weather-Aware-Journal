import { describe, expect, it } from 'vitest';
import { computeMoodWeatherStats, insightText } from '../../src/lib/moodWeatherStats.js';

function entry(mood, weatherType) {
  return { mood, weatherType };
}

describe('computeMoodWeatherStats', () => {
  it('ignores entries missing a mood or a weather type', () => {
    const stats = computeMoodWeatherStats([
      entry('Happy', undefined),
      { weatherType: 'Rain' },
      entry('Sad', 'Rain'),
    ]);
    expect(stats.sampleSize).toBe(1);
    expect(stats.weatherTypes).toEqual(['Rain']);
  });

  it('builds a weatherType x mood count matrix', () => {
    const stats = computeMoodWeatherStats([
      entry('Sad', 'Rain'),
      entry('Sad', 'Rain'),
      entry('Happy', 'Clear sky'),
    ]);
    expect(stats.matrix.Rain.Sad).toBe(2);
    expect(stats.matrix['Clear sky'].Happy).toBe(1);
    expect(stats.maxCount).toBe(2);
  });

  it('finds a negative-mood insight when a weather type skews low', () => {
    const stats = computeMoodWeatherStats([
      entry('Sad', 'Rain'),
      entry('Sad', 'Rain'),
      entry('Angry', 'Rain'),
      entry('Happy', 'Clear sky'),
    ]);
    expect(stats.insight).toMatchObject({ tone: 'negative', weatherType: 'Rain' });
    expect(insightText(stats)).toMatch(/lower on rain days/);
  });

  it('requires a minimum sample size before claiming a pattern', () => {
    const stats = computeMoodWeatherStats([entry('Sad', 'Rain'), entry('Sad', 'Rain')]);
    expect(stats.insight).toBeNull();
    expect(insightText(stats)).toMatch(/more entries/i);
  });

  it('returns empty structures for no data', () => {
    const stats = computeMoodWeatherStats([]);
    expect(stats.weatherTypes).toEqual([]);
    expect(stats.moods).toEqual([]);
    expect(stats.insight).toBeNull();
  });
});
