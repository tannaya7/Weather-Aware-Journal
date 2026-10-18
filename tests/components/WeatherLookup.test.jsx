import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryForm } from '../../src/components/EntryForm/EntryForm.jsx';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';
import { Settings } from '../../src/pages/Settings.jsx';
import { loadEntries } from '../../src/lib/storage.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function jsonResponse(body) {
  return { ok: true, json: async () => body };
}

function renderForm() {
  const onSubmit = vi.fn(() => true);
  render(
    <AnnouncerProvider>
      <EntryForm mode="create" onSubmit={onSubmit} />
    </AnnouncerProvider>,
  );
  return { onSubmit };
}

describe('Weather in the entry form', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills in the weather and place from your location', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: (ok) => ok({ coords: { latitude: 17.38, longitude: 78.47 } }) },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('bigdatacloud')
          ? jsonResponse({ city: 'Hyderabad', countryName: 'India' })
          : jsonResponse({ current: { temperature_2m: 31, weather_code: 0, relative_humidity_2m: 50, wind_speed_10m: 2 } }),
      ),
    );
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole('button', { name: /use my current location/i }));
    expect(await screen.findByText('Hyderabad, India')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/what's on your mind/i), 'Hot day');
    await user.click(screen.getByRole('button', { name: /save entry/i }));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      weatherType: 'Clear sky',
      temperature: '31°C',
      locationName: 'Hyderabad, India',
      latitude: 17.38,
      longitude: 78.47,
    });
  });

  it('explains when location access is blocked', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) },
    });
    renderForm();

    await user.click(screen.getByRole('button', { name: /use my current location/i }));

    expect(await screen.findByText(/location access is blocked/i)).toBeInTheDocument();
  });

  it('says it will look up historical weather for a past date', async () => {
    const fetchMock = vi.fn(async (url) =>
      url.includes('geocoding')
        ? jsonResponse({ results: [{ latitude: 1, longitude: 2, name: 'Pune', country: 'India' }] })
        : jsonResponse({
            hourly: {
              time: ['2025-03-10T09:00'],
              temperature_2m: [24],
              weather_code: [2],
              relative_humidity_2m: [40],
              wind_speed_10m: [3],
            },
          }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(document.getElementById('dateInput'), { target: { value: '2025-03-10T09:30' } });
    expect(screen.getByText(/looks up the actual weather on monday, 10 march 2025/i)).toBeInTheDocument();

    await user.type(document.getElementById('locationInput'), 'Pune');
    await user.click(screen.getByRole('button', { name: /fetch weather data/i }));

    expect(await screen.findByText(/weather updated for pune, india on monday, 10 march 2025/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toContain('archive-api.open-meteo.com');
  });
});

describe('Fill in missing weather (Settings)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('looks up and saves weather for entries without it', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('geocoding')
          ? jsonResponse({ results: [{ latitude: 1, longitude: 2, name: 'Pune', country: 'India' }] })
          : jsonResponse({
              hourly: {
                time: ['2025-03-10T09:00'],
                temperature_2m: [24],
                weather_code: [2],
                relative_humidity_2m: [40],
                wind_speed_10m: [3],
              },
            }),
      ),
    );
    await seedEntries([
      { id: 1, content: 'No weather yet', date: new Date(2025, 2, 10, 9).toISOString() },
      { id: 2, content: 'Has weather', date: '2025-03-11T10:00', weatherType: 'Rain' },
    ]);
    await renderWithJournal(<Settings />);

    expect(screen.getByText(/1 entry has no weather/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/city for the 1 without a place/i), 'Pune');
    await user.click(screen.getByRole('button', { name: 'Fill in missing weather' }));

    expect(await screen.findByText('Added weather to 1 entry.')).toBeInTheDocument();
    const saved = (await loadEntries()).find((e) => e.id === 1);
    expect(saved).toMatchObject({ weatherType: 'Clouds', temperature: '24°C', locationName: 'Pune, India' });
  });

  it('says so when every entry already has weather', async () => {
    await seedEntries([{ id: 1, content: 'Done', date: '2025-03-11T10:00', weatherType: 'Rain' }]);
    await renderWithJournal(<Settings />);
    expect(screen.getByText(/every entry has its weather/i)).toBeInTheDocument();
  });
});
