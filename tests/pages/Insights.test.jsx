import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { Insights } from '../../src/pages/Insights.jsx';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function daysAgo(n, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function yearsAgoToday(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

const ENTRIES = [
  { id: 1, content: 'Sunny run', mood: 'Happy', weatherType: 'Clear sky', temperature: '28°C', date: daysAgo(1) },
  { id: 2, content: 'Hot again', mood: 'Happy', weatherType: 'Clear sky', temperature: '30°C', date: daysAgo(2) },
  { id: 3, content: 'Rainy blues', mood: 'Sad', weatherType: 'Rain', temperature: '14°C', date: daysAgo(9) },
  { id: 4, content: 'Way back', mood: 'Peaceful', date: daysAgo(200) },
];

describe('Insights page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('invites you to write when there are no entries', async () => {
    await renderWithJournal(<Insights />);
    expect(screen.getByText(/write a few entries/i)).toBeInTheDocument();
  });

  it('shows summary tiles', async () => {
    await seedEntries(ENTRIES);
    await renderWithJournal(<Insights />);

    expect(screen.getByText('Entries', { selector: 'p' }).nextSibling).toHaveTextContent('4');
    expect(screen.getByText('Days written').nextSibling).toHaveTextContent('4');
    expect(screen.getByText('Most common mood').nextSibling).toHaveTextContent('Happy');
    expect(screen.getByText('Most common weather').nextSibling).toHaveTextContent('Clear sky');
  });

  it('lists weekly mood in the table view, and the range buttons change the period', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    await renderWithJournal(<Insights />);

    const trend = screen.getByRole('region', { name: 'Mood over time' });
    const rows = () => within(trend).getAllByRole('row').slice(1);
    expect(rows()).toHaveLength(2); // the 200-day-old entry is outside 6 months

    await user.click(within(trend).getByRole('button', { name: '1 year' }));
    expect(within(trend).getByRole('button', { name: '1 year' })).toHaveAttribute('aria-pressed', 'true');
    expect(rows()).toHaveLength(3);
  });

  it('reads each week with the arrow keys', async () => {
    await seedEntries(ENTRIES);
    await renderWithJournal(<Insights />);

    const chart = screen.getByRole('img', { name: /average mood per week/i });
    fireEvent.focus(chart);
    expect(screen.getByRole('status')).toHaveTextContent(/great \(\+2\.0\)/i);

    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(screen.getByRole('status')).toHaveTextContent(/low \(-2\.0\)|no entries/i);
  });

  it('shows the average temperature for each mood', async () => {
    await seedEntries(ENTRIES);
    await renderWithJournal(<Insights />);

    const temp = screen.getByRole('region', { name: 'Mood and temperature' });
    expect(within(temp).getByText(/Happy/).closest('li')).toHaveTextContent('29°C · 2 days');
    expect(within(temp).getByText(/Sad/).closest('li')).toHaveTextContent('14°C · 1 day');
    expect(within(temp).queryByText(/Peaceful/)).not.toBeInTheDocument();
  });
});

describe('On this day', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows entries from this date in past years on the dashboard', async () => {
    await seedEntries([
      { id: 1, content: 'A year back', mood: 'Happy', date: yearsAgoToday(1) },
      { id: 2, content: 'Two years back', date: yearsAgoToday(2), weatherIcon: '☀️', temperature: '22°C' },
    ]);
    await renderWithJournal(<Dashboard />);

    const card = screen.getByRole('region', { name: /on this day/i });
    const links = within(card).getAllByRole('link');
    expect(links[0]).toHaveTextContent('1 year ago');
    expect(links[0]).toHaveTextContent('A year back');
    expect(links[0]).toHaveAttribute('href', '/entry/1');
    expect(links[1]).toHaveTextContent('2 years ago');
    expect(links[1]).toHaveTextContent('22°C');
  });

  it('is hidden when there are no memories for today', async () => {
    await seedEntries([{ id: 1, content: 'Recent', date: daysAgo(3) }]);
    await renderWithJournal(<Dashboard />);
    expect(screen.queryByRole('region', { name: /on this day/i })).not.toBeInTheDocument();
  });
});
