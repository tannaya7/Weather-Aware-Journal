import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { EntryFormPage } from '../../src/pages/EntryFormPage.jsx';
import { EntryDetail } from '../../src/pages/EntryDetail.jsx';
import { Settings } from '../../src/pages/Settings.jsx';
import { Insights } from '../../src/pages/Insights.jsx';
import { loadEntries, loadSetting, unlock } from '../../src/lib/storage.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function renderAt(path) {
  return renderWithJournal(
    <Routes>
      <Route path="/new" element={<EntryFormPage />} />
      <Route path="/entry/:id" element={<EntryDetail />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/insights" element={<Insights />} />
      <Route path="/" element={<p>Dashboard</p>} />
    </Routes>,
    { initialEntries: [path] },
  );
}

describe('Habits', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('are logged on the entry form and saved with the entry', async () => {
    const user = userEvent.setup();
    await renderAt('/new');

    await user.type(await screen.findByLabelText(/what's on your mind/i), 'Good day');
    await user.type(screen.getByRole('spinbutton', { name: /sleep/i }), '7.5');
    await user.click(screen.getByRole('checkbox', { name: /exercise/i }));
    await user.click(screen.getByRole('button', { name: /save entry/i }));

    await screen.findByText('Dashboard');
    expect((await loadEntries())[0].habits).toEqual({ sleep: 7.5, exercise: true });
  });

  it('can be turned off, and custom ones added, in Settings', async () => {
    const user = userEvent.setup();
    const view = await renderAt('/settings');

    const habits = screen.getByRole('region', { name: 'Habits' });
    await user.click(within(habits).getByRole('checkbox', { name: /screen time/i }));
    await user.type(within(habits).getByLabelText('New yes/no habit'), 'Meditated');
    await user.type(within(habits).getByLabelText(/emoji/i), '🧘');
    await user.click(within(habits).getByRole('button', { name: 'Add habit' }));
    expect(await within(habits).findByRole('checkbox', { name: /meditated/i })).toBeChecked();

    await user.click(within(habits).getByRole('button', { name: 'Add habit' }));
    expect(within(habits).getByRole('alert')).toHaveTextContent('Give the habit a name.');
    view.unmount();

    await renderAt('/new');
    expect(await screen.findByRole('checkbox', { name: /meditated/i })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /screen time/i })).not.toBeInTheDocument();
  });

  it('keeps habit settings encrypted across turning the lock on', async () => {
    const user = userEvent.setup();
    const view = await renderAt('/settings');
    await user.type(screen.getByLabelText('New yes/no habit'), 'Therapy');
    await user.click(screen.getByRole('button', { name: 'Add habit' }));
    await user.type(screen.getByLabelText('New passcode'), '2468');
    await user.type(screen.getByLabelText('Repeat passcode'), '2468');
    await user.click(screen.getByRole('button', { name: 'Turn on passcode lock' }));
    await screen.findByText(/passcode lock is on/i);
    view.unmount();

    expect(await loadSetting('habits')).toBeNull(); // not readable without the key
    const settings = await loadSetting('habits', await unlock('2468'));
    expect(settings.custom.map((h) => h.name)).toEqual(['Therapy']);
  });

  it('shows which habits line up with better days on Insights', async () => {
    const entries = [];
    for (let i = 0; i < 6; i++) {
      entries.push({
        id: i + 1,
        content: `Day ${i}`,
        mood: i < 3 ? 'Happy' : 'Sad',
        habits: { exercise: i < 3 },
        date: new Date(Date.now() - i * 86400000).toISOString(),
      });
    }
    await seedEntries(entries);
    await renderAt('/insights');

    const section = screen.getByRole('region', { name: 'Habits and mood' });
    expect(within(section).getByText(/not what causes what/i)).toBeInTheDocument();
    const rows = within(section).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(/Exercise.*Days with.*Great \(\+2\.0\).*3/);
    expect(rows[1]).toHaveTextContent(/Exercise.*Days without.*Very low \(-2\.0\).*3/);
  });
});

describe('Sun, air, and moon', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows on the entry page', async () => {
    await seedEntries([
      {
        id: 1,
        content: 'Bright day',
        date: '2024-01-25T18:00:00Z',
        sunrise: '06:04',
        sunset: '18:14',
        daylightHours: 12.2,
        uvIndex: 8.6,
        airQuality: 42,
        habits: { sleep: 8, exercise: true },
      },
    ]);
    await renderAt('/entry/1');

    const sky = screen.getByRole('list', { name: 'Sun, air, and moon' });
    expect(within(sky).getByLabelText('Sunrise 06:04, sunset 18:14')).toBeInTheDocument();
    expect(within(sky).getByLabelText('12.2 hours of daylight')).toBeInTheDocument();
    expect(within(sky).getByLabelText('UV index 9, Very high')).toBeInTheDocument();
    expect(within(sky).getByLabelText('Air quality index 42, Good')).toBeInTheDocument();
    expect(within(sky).getByLabelText('Full moon')).toBeInTheDocument();

    const habits = screen.getByRole('list', { name: 'Habits' });
    expect(habits).toHaveTextContent('Sleep: 8 hours');
    expect(habits).toHaveTextContent('Exercise');
  });

  it('feeds the daylight and moon charts on Insights', async () => {
    await seedEntries([
      { id: 1, content: 'a', mood: 'Sad', daylightHours: 9.5, date: '2024-01-11T12:00:00Z' },
      { id: 2, content: 'b', mood: 'Happy', daylightHours: 13, date: '2024-01-25T18:00:00Z' },
    ]);
    await renderAt('/insights');

    const section = screen.getByRole('region', { name: 'Sun, air, and moon' });
    await waitFor(() => expect(within(section).getByRole('heading', { name: 'Hours of daylight' })).toBeInTheDocument());
    expect(within(section).getByRole('heading', { name: 'Moon phase' })).toBeInTheDocument();
    expect(within(section).queryByRole('heading', { name: 'Air quality' })).not.toBeInTheDocument();
  });
});
