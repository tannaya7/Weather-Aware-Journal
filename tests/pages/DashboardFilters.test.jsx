import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function renderDashboard() {
  return renderWithJournal(<Dashboard />);
}

function moodChips() {
  return screen.getByRole('group', { name: 'Filter by mood' });
}

function timelineText() {
  return screen.getByRole('heading', { name: 'Your Journal' }).parentElement.textContent;
}

describe('Dashboard filters', () => {
  beforeEach(async () => {
    localStorage.clear();
    await seedEntries([
      { id: 1, content: 'Rainy blues', mood: 'Sad', weatherType: 'Rain', tags: ['work'], date: '2026-09-01T10:00:00' },
      { id: 2, content: 'Sunny picnic', mood: 'Happy', weatherType: 'Clear sky', tags: ['family'], date: '2026-09-02T10:00:00' },
      { id: 3, content: 'Rain dance', mood: 'Happy', weatherType: 'Rain', tags: [], date: '2026-09-03T10:00:00' },
    ]);
  });

  it('shows no filter chips when there are no entries', async () => {
    globalThis.indexedDB = new IDBFactory(); // drop the seeded entries
    await renderDashboard();
    expect(screen.queryByRole('group', { name: /filter by/i })).not.toBeInTheDocument();
  });

  it('narrows the timeline and shows a count when a chip is picked', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.click(within(moodChips()).getByRole('button', { name: /happy/i }));

    expect(within(moodChips()).getByRole('button', { name: /happy/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('2 entries');
    expect(timelineText()).toContain('Sunny picnic');
    expect(timelineText()).toContain('Rain dance');
    expect(timelineText()).not.toContain('Rainy blues');
  });

  it('combines groups, and Clear filters resets them', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await user.click(within(moodChips()).getByRole('button', { name: /happy/i }));
    await user.click(
      within(screen.getByRole('group', { name: 'Filter by weather' })).getByRole('button', { name: /rain/i }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('1 entry');
    expect(timelineText()).toContain('Rain dance');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    expect(timelineText()).toContain('Rainy blues');
  });

  it('filters by tag', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await user.click(
      within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', { name: '#family' }),
    );

    expect(screen.getByRole('status')).toHaveTextContent('1 entry');
    expect(timelineText()).toContain('Sunny picnic');
  });
});
