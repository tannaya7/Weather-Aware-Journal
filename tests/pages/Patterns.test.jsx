import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Insights } from '../../src/pages/Insights.jsx';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

const MOODS = ['Sad', 'Anxious', 'Peaceful', 'Happy'];

// Mood rises with daylight, with a little deterministic wobble.
function daylightEntries(count) {
  return Array.from({ length: count }, (_, i) => {
    const daylight = 8 + (i % 20) * 0.4;
    const level = Math.min(3, Math.max(0, Math.round((daylight - 8) / 2.7 + ((i * 7) % 5 - 2) * 0.2)));
    return { id: i + 1, content: `Day ${i}`, mood: MOODS[level], daylightHours: daylight, date: daysAgo(i) };
  });
}

describe('Patterns on the Insights page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('asks for more days of mood when there are too few', async () => {
    await seedEntries(daylightEntries(5));
    await renderWithJournal(<Insights />);
    const section = screen.getByRole('heading', { name: 'What moves your mood' }).closest('section');
    expect(within(section).getByText(/at least 14 different days/i)).toBeInTheDocument();
    expect(within(section).getByText(/You have 5\./)).toBeInTheDocument();
  });

  it('shows a clear pattern with its numbers and a not-causation note', async () => {
    await seedEntries(daylightEntries(60));
    await renderWithJournal(<Insights />);
    const section = screen.getByRole('heading', { name: 'What moves your mood' }).closest('section');
    expect(within(section).getByText(/not what causes what/i)).toBeInTheDocument();
    expect(
      within(section).getByText('Your mood tends to be higher on days with more daylight.'),
    ).toBeInTheDocument();
    expect(within(section).getAllByText('Clear pattern').length).toBeGreaterThan(0);
    expect(within(section).getAllByText(/· 60 days/).length).toBeGreaterThan(0);
  });

  it('says plainly when nothing stands out', async () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      content: `Day ${i}`,
      mood: 'Happy',
      daylightHours: 8 + (i % 7),
      date: daysAgo(i),
    }));
    await seedEntries(entries);
    await renderWithJournal(<Insights />);
    const section = screen.getByRole('heading', { name: 'What moves your mood' }).closest('section');
    // Mood never varies, so nothing can be tested: no invented patterns.
    expect(within(section).queryByText('Clear pattern')).not.toBeInTheDocument();
    expect(within(section).getByText(/No clear patterns yet/)).toBeInTheDocument();
  });
});
