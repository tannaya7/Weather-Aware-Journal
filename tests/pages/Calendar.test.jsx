import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { Calendar } from '../../src/pages/Calendar.jsx';
import { ThemeProvider } from '../../src/context/ThemeContext.jsx';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';
import { EntriesProvider } from '../../src/context/EntriesContext.jsx';

const THIS_YEAR = new Date().getFullYear();

function seedEntries(entries) {
  localStorage.setItem('weatherJournalEntries', JSON.stringify(entries));
}

function renderCalendar() {
  render(
    <ThemeProvider>
      <AnnouncerProvider>
        <EntriesProvider>
          <MemoryRouter>
            <Calendar />
          </MemoryRouter>
        </EntriesProvider>
      </AnnouncerProvider>
    </ThemeProvider>,
  );
}

function moodRow(mood) {
  return screen.getAllByRole('listitem').find((li) => li.textContent.includes(mood));
}

describe('Calendar page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the current year with all twelve months', () => {
    renderCalendar();

    expect(screen.getByText(String(THIS_YEAR))).toBeInTheDocument();
    for (const month of ['January', 'June', 'December']) {
      expect(screen.getByRole('heading', { name: month })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(12);
  });

  it('links a day with an entry to that entry, labelled with its mood', () => {
    seedEntries([
      { id: 1, content: 'Sunny walk', mood: 'Happy', date: `${THIS_YEAR}-03-15T10:00:00` },
    ]);
    renderCalendar();

    const link = screen.getByRole('link', { name: /march 15: entry logged, mood happy/i });
    expect(link).toHaveAttribute('href', '/entry/1');
  });

  it('uses the earliest entry when a day has more than one', () => {
    seedEntries([
      { id: 2, content: 'Evening', mood: 'Sad', date: `${THIS_YEAR}-05-02T20:00:00` },
      { id: 1, content: 'Morning', mood: 'Excited', date: `${THIS_YEAR}-05-02T08:00:00` },
    ]);
    renderCalendar();

    const link = screen.getByRole('link', { name: /may 2: entry logged/i });
    expect(link).toHaveAccessibleName(/mood excited/i);
    expect(link).toHaveAttribute('href', '/entry/1');
  });

  it('counts moods for the selected year only', () => {
    seedEntries([
      { id: 1, content: 'a', mood: 'Happy', date: `${THIS_YEAR}-01-10T10:00:00` },
      { id: 2, content: 'b', mood: 'Happy', date: `${THIS_YEAR}-02-10T10:00:00` },
      { id: 3, content: 'c', mood: 'Sad', date: `${THIS_YEAR}-03-10T10:00:00` },
      { id: 4, content: 'd', mood: 'Sad', date: `${THIS_YEAR - 1}-03-10T10:00:00` },
    ]);
    renderCalendar();

    expect(screen.getByRole('heading', { name: `Moods in ${THIS_YEAR}` })).toBeInTheDocument();
    expect(within(moodRow('Happy')).getByText('2')).toBeInTheDocument();
    expect(within(moodRow('Sad')).getByText('1')).toBeInTheDocument();
    expect(within(moodRow('Angry')).getByText('0')).toBeInTheDocument();
  });

  it('moves between years with the arrow buttons', async () => {
    const user = userEvent.setup();
    seedEntries([
      { id: 1, content: 'Last year', mood: 'Peaceful', date: `${THIS_YEAR - 1}-07-04T10:00:00` },
    ]);
    renderCalendar();

    expect(screen.queryByRole('link', { name: /july 4/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /previous year/i }));
    expect(screen.getByText(String(THIS_YEAR - 1))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /july 4: entry logged, mood peaceful/i })).toBeInTheDocument();
    expect(within(moodRow('Peaceful')).getByText('1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next year/i }));
    await user.click(screen.getByRole('button', { name: /next year/i }));
    expect(screen.getByText(String(THIS_YEAR + 1))).toBeInTheDocument();
  });
});
