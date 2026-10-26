import { test, expect, seedEntries } from './fixtures.js';

// Screenshot comparisons: catch a layout or style that changed by accident.
// Each page is drawn on a fixed date with fixed entries, so the pictures
// only change when the design does. Baselines are per platform (fonts render
// differently): run `npm run test:visual:update` on the platform you compare
// on, and look at the new images before committing them.

const NOW = new Date('2026-10-12T12:00:00');

function at(day, hour = 12) {
  return `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`;
}

const ENTRIES = [
  {
    id: 1,
    content: 'Sunny run by the lake\n\nLegs heavy, head clear.',
    mood: 'Happy',
    weatherType: 'Clear sky',
    weatherIcon: '☀️',
    temperature: '24°C',
    locationName: 'Hyderabad, India',
    tags: ['run'],
    date: at(11),
    updatedAt: 1,
  },
  {
    id: 2,
    content: 'Rainy blues, stayed in with tea.',
    mood: 'Sad',
    weatherType: 'Rain',
    weatherIcon: '🌧️',
    temperature: '19°C',
    date: at(9),
    updatedAt: 1,
  },
  { id: 3, content: 'Quiet evening, wrote letters.', mood: 'Peaceful', date: at(5), updatedAt: 1 },
];

// Seeding opened the app once, which saved the theme it picked then; forget
// it so the app follows the color scheme each test asks for.
async function followSystemTheme(page) {
  await page.evaluate(() => localStorage.removeItem('weatherJournalTheme'));
}

test.describe('visual @visual', () => {
  test.skip(({ isMobile }) => isMobile, 'one set of pictures, at desktop size');

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
    await seedEntries(page, ENTRIES);
  });

  const shot = { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0.002 };

  test('dashboard, light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await followSystemTheme(page);
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Your Journal' })).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard-light.png', shot);
  });

  test('dashboard, dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await followSystemTheme(page);
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Your Journal' })).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard-dark.png', shot);
  });

  test('an entry', async ({ page }) => {
    await page.goto('./#/entry/1');
    await expect(page.getByRole('heading', { name: 'Sunny run by the lake' })).toBeVisible();
    await expect(page).toHaveScreenshot('entry.png', shot);
  });

  test('the editor', async ({ page }) => {
    await page.goto('./#/new');
    await expect(page.getByLabel("What's on your mind?")).toBeVisible();
    await expect(page).toHaveScreenshot('editor.png', shot);
  });

  test('insights', async ({ page }) => {
    await page.goto('./#/insights');
    await expect(page.getByRole('heading', { name: 'Mood over time' })).toBeVisible();
    await expect(page).toHaveScreenshot('insights.png', shot);
  });
});
