import { test as base, expect } from '@playwright/test';

// A 1x1 transparent PNG, served for map tiles.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

function hourly(day, temperature, code) {
  const hours = Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`);
  return {
    hourly: {
      time: hours,
      temperature_2m: hours.map(() => temperature),
      relative_humidity_2m: hours.map(() => 70),
      weather_code: hours.map(() => code),
      wind_speed_10m: hours.map(() => 3),
    },
  };
}

// Every test gets: no real network (weather, place names, and map tiles are
// answered here), a fixed location, and console errors collected.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 17.385, longitude: 78.4867 });
    await use(context);
  },

  page: async ({ page }, use) => {
    page.consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') page.consoleErrors.push(msg.text());
    });
    page.on('pageerror', (error) => page.consoleErrors.push(error.message));

    await page.route('**/geocoding-api.open-meteo.com/**', (route) =>
      route.fulfill({
        json: { results: [{ latitude: 17.385, longitude: 78.4867, name: 'Hyderabad', country: 'India' }] },
      }),
    );
    await page.route('**/api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has('current')) {
        return route.fulfill({
          json: { current: { temperature_2m: 29, relative_humidity_2m: 55, weather_code: 0, wind_speed_10m: 2.5 } },
        });
      }
      return route.fulfill({ json: hourly(url.searchParams.get('start_date'), 24, 61) });
    });
    await page.route('**/archive-api.open-meteo.com/**', (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({ json: hourly(url.searchParams.get('start_date'), 18, 3) });
    });
    await page.route('**/air-quality-api.open-meteo.com/**', (route) =>
      route.fulfill({ json: { hourly: { time: [], us_aqi: [] } } }),
    );
    await page.route('**/api.bigdatacloud.net/**', (route) =>
      route.fulfill({ json: { city: 'Hyderabad', countryName: 'India' } }),
    );
    await page.route('**/*.tile.openstreetmap.org/**', (route) =>
      route.fulfill({ body: PIXEL, contentType: 'image/png' }),
    );

    await use(page);
  },
});

export { expect };

export function daysAgo(n, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// Puts entries straight into the app's IndexedDB (same schema as
// src/lib/storage.js), then reloads so the app reads them.
export async function seedEntries(page, entries) {
  await page.goto('./');
  await page.evaluate(
    (items) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('weatherJournal', 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('entries', 'readwrite');
          for (const item of items) tx.objectStore('entries').put(item);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    entries,
  );
  await page.reload();
  await expect(page.getByText('Opening your journal…')).toHaveCount(0);
}

// The raw records on disk, to check what's actually stored.
export function rawEntries(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('weatherJournal');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('entries').objectStore('entries').getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(JSON.stringify(req.result));
          };
        };
      }),
  );
}

// Opens a page from the sidebar (works on desktop and mobile layouts).
export async function goTo(page, name) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name }).click();
}
