import { describe, expect, it, vi } from 'vitest';
import { availableYears, drawYearReview, entriesInYear, yearSummary } from '../../src/lib/yearReview.js';

function on(y, m, d, extra = {}) {
  return { id: `${y}-${m}-${d}-${Math.random()}`, date: new Date(y, m, d, 12).toISOString(), content: '', ...extra };
}

const ENTRIES = [
  on(2025, 0, 1, { mood: 'Happy', weatherType: 'Clear sky', temperature: '30°C', content: 'one two three' }),
  on(2025, 0, 2, { mood: 'Happy', weatherType: 'Rain', temperature: '12°C', content: 'four' }),
  on(2025, 0, 3, { mood: 'Sad', weatherType: 'Rain', temperature: '-2°C' }),
  on(2025, 0, 3, { mood: 'Happy' }), // second entry the same day
  on(2025, 5, 20, { mood: 'Peaceful' }),
  on(2024, 11, 31, { mood: 'Angry', content: 'different year' }),
];

describe('availableYears / entriesInYear', () => {
  it('lists years with entries, newest first', () => {
    expect(availableYears(ENTRIES)).toEqual([2025, 2024]);
    expect(availableYears([{ date: 'nope' }, {}])).toEqual([]);
  });

  it('picks one year’s entries', () => {
    expect(entriesInYear(ENTRIES, 2024)).toHaveLength(1);
  });
});

describe('yearSummary', () => {
  it('sums up a year', () => {
    const summary = yearSummary(ENTRIES, 2025);

    expect(summary).toMatchObject({
      year: 2025,
      entries: 5,
      daysWritten: 4,
      words: 4,
      longestStreak: 3,
      topMood: { mood: 'Happy', emoji: '😊', count: 3 },
      topWeather: { type: 'Rain', icon: '🌧️', count: 2 },
      busiestMonth: { month: 'January', count: 4 },
    });
    expect(summary.warmest.temp).toBe(30);
    expect(summary.coldest.temp).toBe(-2);
    expect(summary.moodCounts.map((m) => m.count)).toEqual([3, 1, 1, 0, 0, 0]);
  });

  it('handles a year with nothing in it', () => {
    const summary = yearSummary(ENTRIES, 2020);
    expect(summary).toMatchObject({ entries: 0, daysWritten: 0, longestStreak: 0, topMood: null, warmest: null });
  });
});

describe('drawYearReview', () => {
  function recordingContext() {
    const texts = [];
    const ctx = {
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(),
      fillText: (value) => texts.push(value),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
    };
    return { ctx, texts };
  }

  it('draws the year, the stats, and the highlights', () => {
    const { ctx, texts } = recordingContext();
    drawYearReview(ctx, yearSummary(ENTRIES, 2025));

    expect(texts).toEqual(
      expect.arrayContaining([
        'My 2025',
        '5',
        'entries',
        '4',
        'days written',
        '3',
        'longest streak (days)',
        'Most common mood',
        'Happy',
        'Most common weather',
        'Rain',
        'Busiest month',
        'January',
        '-2° to 30°C',
      ]),
    );
  });

  it('leaves out highlights it has no data for', () => {
    const { ctx, texts } = recordingContext();
    drawYearReview(ctx, yearSummary([on(2025, 1, 1, { content: 'just words' })], 2025));

    expect(texts).toContain('entry');
    expect(texts).not.toContain('Most common mood');
    expect(texts).not.toContain('Temperature range');
  });
});
