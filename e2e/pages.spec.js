import { test, expect, daysAgo, goTo, seedEntries } from './fixtures.js';

const ENTRIES = [
  {
    id: 1,
    content: 'Sunny run',
    mood: 'Happy',
    weatherType: 'Clear sky',
    weatherIcon: '☀️',
    temperature: '30°C',
    locationName: 'Hyderabad, India',
    latitude: 17.385,
    longitude: 78.4867,
    date: daysAgo(1),
  },
  {
    id: 2,
    content: 'Rainy blues',
    mood: 'Sad',
    weatherType: 'Rain',
    weatherIcon: '🌧️',
    temperature: '19°C',
    locationName: 'Pune, India',
    latitude: 18.52,
    longitude: 73.85,
    date: daysAgo(9),
  },
  { id: 3, content: 'Quiet evening', mood: 'Peaceful', date: daysAgo(15) },
];

test.beforeEach(async ({ page }) => {
  await seedEntries(page, ENTRIES);
});

test('Insights shows tiles and both charts', async ({ page }) => {
  await goTo(page, 'Insights');

  await expect(page.getByText('Days written')).toBeVisible();
  const trend = page.getByRole('region', { name: 'Mood over time' });
  await expect(trend.getByRole('img', { name: /average mood per week/i })).toBeVisible();
  await expect(trend.locator('path').first()).toHaveAttribute('d', /M/);

  const temp = page.getByRole('region', { name: 'Mood and temperature' });
  await expect(temp.getByText('30°C')).toBeVisible();
  expect(page.consoleErrors).toEqual([]);
});

test('Map shows a pin per place, with entries in the popup', async ({ page }) => {
  await goTo(page, 'Map');

  await expect(page.getByRole('status')).toHaveText('2 entries in 2 places · 1 without a place');
  const pins = page.locator('.leaflet-marker-icon');
  await expect(pins).toHaveCount(2);

  await page.getByTitle('Hyderabad, India: 1 entry').click();
  const popup = page.locator('.leaflet-popup-content');
  await expect(popup).toContainText('Sunny run');
  await popup.getByRole('link', { name: /sunny run/i }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sunny run' })).toBeVisible();
  expect(page.consoleErrors).toEqual([]);
});

test('Export draws the year in review and previews the printable journal', async ({ page }) => {
  await goTo(page, 'Export');

  const image = page.getByRole('img', { name: /in review/i });
  await expect(image).toBeVisible();
  // A real PNG was drawn: the image has its natural 1080px width.
  expect(await image.evaluate((img) => img.naturalWidth)).toBe(1080);
  await expect(page.getByRole('link', { name: 'Download image' })).toHaveAttribute('download', /in-review\.png$/);

  await expect(page.locator('.print-area h2')).toHaveText(['Quiet evening', 'Rainy blues', 'Sunny run']);
  expect(page.consoleErrors).toEqual([]);
});

test('the streak card shows on the dashboard', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Writing streak' })).toBeVisible();
});

test('no page scrolls sideways on a phone or desktop', async ({ page }) => {
  for (const name of ['Home', 'Calendar', 'Insights', 'Map', 'Export', 'Contact', 'Settings']) {
    await goTo(page, name);
    await expect(page.locator('#main-content')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${name} is wider than the screen`).toBeLessThanOrEqual(1);
  }
  expect(page.consoleErrors).toEqual([]);
});
