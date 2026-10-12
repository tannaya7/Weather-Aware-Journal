import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { Settings } from '../../src/pages/Settings.jsx';
import { Insights } from '../../src/pages/Insights.jsx';
import { loadSetting } from '../../src/lib/storage.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function renderAt(path) {
  return renderWithJournal(
    <Routes>
      <Route path="/settings" element={<Settings />} />
      <Route path="/insights" element={<Insights />} />
    </Routes>,
    { initialEntries: [path] },
  );
}

function daysAgo(n, extra = {}) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return { id: `e${n}`, content: `Day ${n}`, date: d.toISOString(), ...extra };
}

describe('Weekly goals in Settings', () => {
  beforeEach(() => localStorage.clear());

  it('turns a goal on with sensible defaults and saves changes', async () => {
    const user = userEvent.setup();
    await renderAt('/settings');
    const goals = screen.getByRole('region', { name: 'Weekly goals' });

    await user.click(within(goals).getByRole('checkbox', { name: /exercise/i }));
    expect(await within(goals).findByText('Exercise: 3 days a week')).toBeInTheDocument();

    await user.selectOptions(await within(goals).findByLabelText('Exercise days per week'), '5');
    expect(await within(goals).findByText('Exercise: 5 days a week')).toBeInTheDocument();

    await user.click(within(goals).getByRole('checkbox', { name: /sleep/i }));
    expect(await within(goals).findByText('Sleep: at least 7 hours on 5 days a week')).toBeInTheDocument();
    await user.selectOptions(await within(goals).findByLabelText('Sleep goal type'), 'atMost');
    expect(await within(goals).findByText('Sleep: at most 7 hours on 5 days a week')).toBeInTheDocument();

    await waitFor(async () => {
      const saved = await loadSetting('habits');
      expect(saved.goals).toEqual({
        exercise: { days: 5 },
        sleep: { days: 5, direction: 'atMost', threshold: 7 },
      });
    });
  });

  it('keeps goals when a habit is added, and drops a custom habit goal when it is removed', async () => {
    const user = userEvent.setup();
    await renderAt('/settings');
    const habits = screen.getByRole('region', { name: 'Habits' });
    const goals = screen.getByRole('region', { name: 'Weekly goals' });

    await user.click(within(goals).getByRole('checkbox', { name: /exercise/i }));
    await user.type(within(habits).getByLabelText('New yes/no habit'), 'Meditated');
    await user.click(within(habits).getByRole('button', { name: 'Add habit' }));
    expect(await within(goals).findByRole('checkbox', { name: /meditated/i })).not.toBeChecked();
    expect(within(goals).getByRole('checkbox', { name: /exercise/i })).toBeChecked();

    await user.click(within(goals).getByRole('checkbox', { name: /meditated/i }));
    await user.click(await within(habits).findByRole('button', { name: /remove habit meditated/i }));
    await waitFor(async () => {
      const saved = await loadSetting('habits');
      expect(Object.keys(saved.goals)).toEqual(['exercise']);
    });
  });

  it('tells you to turn on a habit when none are tracked', async () => {
    const user = userEvent.setup();
    await renderAt('/settings');
    const habits = screen.getByRole('region', { name: 'Habits' });
    for (const name of [/sleep/i, /exercise/i, /water/i, /screen time/i]) {
      await user.click(within(habits).getByRole('checkbox', { name }));
    }
    const goals = screen.getByRole('region', { name: 'Weekly goals' });
    expect(await within(goals).findByText(/turn on a habit above/i)).toBeInTheDocument();
  });
});

describe('Goals and outlook on Insights', () => {
  beforeEach(() => localStorage.clear());

  it('invites you to set a goal when there is none', async () => {
    await seedEntries([daysAgo(1, { mood: 'Happy' })]);
    await renderAt('/insights');
    const goals = screen.getByRole('region', { name: 'Weekly goals' });
    expect(within(goals).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('shows progress for a goal set in Settings', async () => {
    const user = userEvent.setup();
    const view = await renderAt('/settings');
    const goals = screen.getByRole('region', { name: 'Weekly goals' });
    await user.click(within(goals).getByRole('checkbox', { name: /exercise/i }));
    await user.selectOptions(await within(goals).findByLabelText('Exercise days per week'), '1');
    await waitFor(async () => expect((await loadSetting('habits')).goals.exercise.days).toBe(1));
    view.unmount();

    await seedEntries([daysAgo(0, { mood: 'Happy', habits: { exercise: true } })]);
    await renderAt('/insights');
    const section = screen.getByRole('region', { name: 'Weekly goals' });
    expect(within(section).getByText('Exercise: 1 day a week')).toBeInTheDocument();
    expect(within(section).getByRole('progressbar', { name: 'Exercise this week' })).toHaveAttribute(
      'aria-valuetext',
      '1 of 1 days',
    );
    expect(within(section).getByText('Goal reached this week')).toBeInTheDocument();
  });

  it('asks for more days before showing the mood outlook', async () => {
    await seedEntries(Array.from({ length: 6 }, (_, i) => daysAgo(i, { mood: 'Happy' })));
    await renderAt('/insights');
    const outlook = screen.getByRole('region', { name: 'Mood outlook' });
    expect(within(outlook).getByText(/at least 28 different days/)).toBeInTheDocument();
    expect(within(outlook).getByText(/You have 6\./)).toBeInTheDocument();
  });

  it('shows the trend and weekday rhythm with enough days', async () => {
    await seedEntries(
      Array.from({ length: 40 }, (_, i) => daysAgo(i, { mood: 'Peaceful' })),
    );
    await renderAt('/insights');
    const outlook = screen.getByRole('region', { name: 'Mood outlook' });
    expect(within(outlook).getByText(/steady over the last four weeks/)).toBeInTheDocument();
    expect(within(outlook).getByText(/do not differ enough to predict/)).toBeInTheDocument();
    expect(within(outlook).getAllByRole('listitem')).toHaveLength(7);
    expect(within(outlook).getAllByRole('img', { name: /Good/ }).length).toBeGreaterThan(0);
  });
});
