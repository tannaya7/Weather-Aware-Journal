import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { EntryFormPage } from '../../src/pages/EntryFormPage.jsx';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

const LOCATED = { id: 1, content: 'In town', mood: 'Happy', date: daysAgo(1), latitude: 51.5, longitude: -0.12, locationName: 'London' };

function stubForecast(daily) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily }) }));
}

function renderApp() {
  return renderWithJournal(
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/new" element={<EntryFormPage />} />
    </Routes>,
  );
}

describe('Tomorrow forecast card', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('is hidden when no entry has a place', async () => {
    await seedEntries([{ id: 1, content: 'Hi', date: daysAgo(1) }]);
    await renderApp();
    expect(screen.queryByText("Tomorrow's weather")).not.toBeInTheDocument();
  });

  it('does not look anything up until asked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await seedEntries([LOCATED]);
    await renderApp();
    expect(screen.getByText(/For London/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the heads-up and starts an entry from its prompt', async () => {
    stubForecast({
      time: ['2026-10-12', '2026-10-13'],
      weather_code: [1, 95],
      temperature_2m_max: [15, 22],
      temperature_2m_min: [9, 14],
      precipitation_sum: [0, 20],
      uv_index_max: [3, 2],
    });
    const user = userEvent.setup();
    await seedEntries([LOCATED]);
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Check the forecast' }));
    expect(await screen.findByText('A thunderstorm is forecast for tomorrow.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Write about it' }));
    const box = await screen.findByLabelText(/what's on your mind|entry|write/i, { selector: 'textarea' });
    expect(box.value).toMatch(/^A storm is on its way\./);
  });

  it('shows an error when the forecast cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const user = userEvent.setup();
    await seedEntries([LOCATED]);
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Check the forecast' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not load the forecast/i));
  });
});
