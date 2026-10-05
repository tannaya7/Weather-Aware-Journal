import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderBanner } from '../../src/components/ReminderBanner/ReminderBanner.jsx';

const EVENING = new Date(2026, 9, 5, 19, 30);
const AFTERNOON = new Date(2026, 9, 5, 15, 0);
const NEXT_EVENING = new Date(2026, 9, 6, 19, 30);

function renderBanner({ entries = [], now = EVENING } = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ReminderBanner entries={entries} now={now} />} />
        <Route path="/new" element={<p>New entry form</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function banner() {
  return screen.queryByRole('complementary', { name: 'Writing reminder' });
}

describe('ReminderBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows in the evening when nothing was written today', () => {
    renderBanner();
    expect(banner()).toHaveTextContent("You haven't written today. How was it?");
  });

  it('stays hidden before 6pm', () => {
    renderBanner({ now: AFTERNOON });
    expect(banner()).not.toBeInTheDocument();
  });

  it('stays hidden once there is an entry today', () => {
    renderBanner({ entries: [{ id: 1, date: new Date(2026, 9, 5, 8).toISOString() }] });
    expect(banner()).not.toBeInTheDocument();
  });

  it('still shows when the only entries are from other days', () => {
    renderBanner({ entries: [{ id: 1, date: new Date(2026, 9, 4, 20).toISOString() }] });
    expect(banner()).toBeInTheDocument();
  });

  it('takes you to the new-entry form', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByRole('button', { name: 'Write now' }));

    expect(screen.getByText('New entry form')).toBeInTheDocument();
  });

  it('can be dismissed for the rest of the day, and comes back tomorrow', async () => {
    const user = userEvent.setup();
    const { unmount } = renderBanner();

    await user.click(screen.getByRole('button', { name: 'Dismiss reminder for today' }));
    expect(banner()).not.toBeInTheDocument();

    unmount();
    const sameDay = renderBanner();
    expect(banner()).not.toBeInTheDocument();

    sameDay.unmount();
    renderBanner({ now: NEXT_EVENING });
    expect(banner()).toBeInTheDocument();
  });

  it('still works when storage is unavailable', async () => {
    const user = userEvent.setup();
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    renderBanner();
    await user.click(screen.getByRole('button', { name: 'Dismiss reminder for today' }));
    expect(banner()).not.toBeInTheDocument();

    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});
