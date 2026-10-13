import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

// Leaflet needs real layout to draw tiles, which jsdom doesn't have, so the
// test records what the page asks Leaflet to do instead.
const leaflet = vi.hoisted(() => {
  const state = { markers: [], views: [] };
  const map = {
    setView: vi.fn(function setView(...args) {
      state.views.push(['setView', ...args]);
      return map;
    }),
    fitBounds: vi.fn((...args) => state.views.push(['fitBounds', ...args])),
    remove: vi.fn(),
    stop: vi.fn(),
    off: vi.fn(),
  };
  const layer = {
    addTo: () => layer,
    clearLayers: vi.fn(() => {
      state.markers = [];
    }),
  };
  const L = {
    map: vi.fn(() => map),
    tileLayer: vi.fn(() => ({ addTo: () => {} })),
    layerGroup: vi.fn(() => layer),
    divIcon: vi.fn((opts) => opts),
    marker: vi.fn((latlng, opts) => {
      const marker = {
        latlng,
        opts,
        bindPopup(content) {
          marker.popup = content;
          return marker;
        },
        addTo() {
          state.markers.push(marker);
          return marker;
        },
      };
      return marker;
    }),
  };
  return { L, state };
});

vi.mock('leaflet', () => ({ default: leaflet.L }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));

const { MapPage } = await import('../../src/pages/MapPage.jsx');

describe('Map page', () => {
  beforeEach(() => {
    localStorage.clear();
    leaflet.state.markers = [];
    leaflet.state.views = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('explains what to do when no entry has a place', async () => {
    await seedEntries([{ id: 1, content: 'Nowhere', date: '2026-01-01' }]);
    await renderWithJournal(<MapPage />);

    expect(screen.getByRole('status')).toHaveTextContent(/entries with a place will show up here/i);
    expect(leaflet.state.markers).toHaveLength(0);
  });

  it('puts one pin per place, with a count and the latest mood', async () => {
    await seedEntries([
      { id: 1, content: 'Morning', mood: 'Sad', date: '2026-01-01', latitude: 17.385, longitude: 78.486, locationName: 'Hyderabad, India' },
      { id: 2, content: 'Evening', mood: 'Happy', date: '2026-02-01', latitude: 17.385, longitude: 78.486, locationName: 'Hyderabad, India' },
      { id: 3, content: 'Trip', date: '2026-03-01', latitude: 59.91, longitude: 10.75, locationName: 'Oslo, Norway' },
      { id: 4, content: 'No place', date: '2026-03-02' },
    ]);
    await renderWithJournal(<MapPage />);

    await waitFor(() => expect(leaflet.state.markers).toHaveLength(2));
    expect(screen.getByRole('status')).toHaveTextContent('3 entries in 2 places · 1 without a place');

    const hyd = leaflet.state.markers.find((m) => m.latlng[0] === 17.385);
    expect(hyd.opts.title).toBe('Hyderabad, India: 2 entries');
    expect(hyd.opts.icon.html.textContent).toBe('😊2');

    const links = [...hyd.popup.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#/entry/2', '#/entry/1']);
    expect(leaflet.state.views.at(-1)[0]).toBe('fitBounds');
  });

  it('never treats entry text as HTML in popups', async () => {
    await seedEntries([
      { id: 1, content: '<img src=x onerror="alert(1)">', date: '2026-01-01', latitude: 1, longitude: 2, locationName: '<b>Place</b>' },
    ]);
    await renderWithJournal(<MapPage />);

    await waitFor(() => expect(leaflet.state.markers).toHaveLength(1));
    const popup = leaflet.state.markers[0].popup;
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.querySelector('b')).toBeNull();
    expect(popup.textContent).toContain('<img src=x');
  });

  it('finds older entries that only have a place name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: [{ latitude: 48.85, longitude: 2.35, name: 'Paris', country: 'France' }] }),
      })),
    );
    await seedEntries([{ id: 1, content: 'Old trip', date: '2025-05-01', locationName: 'Paris, France' }]);
    await renderWithJournal(<MapPage />);

    await waitFor(() => expect(leaflet.state.markers).toHaveLength(1));
    expect(leaflet.state.markers[0].latlng).toEqual([48.85, 2.35]);
    expect(screen.getByRole('status')).toHaveTextContent('1 entry in 1 place');
  });
});
