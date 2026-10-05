import { test, expect, daysAgo, goTo, seedEntries } from './fixtures.js';

test.describe('Writing in the journal', () => {
  test('write an entry with mood and weather, then find, read, edit, delete and undo', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Write a new journal entry' }).click();

    await page.getByLabel("What's on your mind?").fill('Monsoon walk\nThe streets smelled like rain.');
    await page.locator('label', { hasText: 'Peaceful' }).click();
    await page.locator('#locationInput').fill('Hyderabad');
    await page.getByRole('button', { name: 'Fetch weather data for entered location' }).click();
    await expect(page.getByText('Hyderabad, India', { exact: true })).toBeVisible();
    await page.getByLabel(/tags/i).fill('walks, rain');
    await page.getByRole('button', { name: 'Save Entry' }).click();

    // Back on the dashboard, the entry is in the timeline.
    await expect(page.getByRole('heading', { name: 'Your Journal' })).toBeVisible();
    await expect(page.getByText('Monsoon walk')).toBeVisible();

    // Filter chips include its tag.
    await page.getByRole('group', { name: 'Filter by tag' }).getByRole('button', { name: '#walks' }).click();
    await expect(page.getByRole('status').filter({ hasText: /entr/ })).toHaveText('1 entry');

    // Read it.
    await page.getByText('Monsoon walk').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Monsoon walk' })).toBeVisible();
    await expect(page.getByText('The streets smelled like rain.')).toBeVisible();

    // Edit it.
    await page.getByRole('button', { name: /edit entry/i }).click();
    await page.getByLabel("What's on your mind?").fill('Monsoon walk, edited');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Monsoon walk, edited').first()).toBeVisible();

    // Delete it, then undo.
    await page.getByText('Monsoon walk, edited').first().click();
    await page.getByRole('button', { name: /delete entry/i }).click();
    await expect(page.getByText('No entries yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Undo delete entry' }).click();
    await expect(page.getByText('Monsoon walk, edited').first()).toBeVisible();

    expect(page.consoleErrors).toEqual([]);
  });

  test('entries are still there after a reload', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Write a new journal entry' }).click();
    await page.getByLabel("What's on your mind?").fill('Still here tomorrow');
    await page.getByRole('button', { name: 'Save Entry' }).click();
    await expect(page.getByText('Still here tomorrow')).toBeVisible();

    await page.reload();

    await expect(page.getByText('Still here tomorrow')).toBeVisible();
  });

  test('an unsaved draft survives closing the page right after typing', async ({ page }) => {
    await page.goto('./#/new');
    await page.getByLabel("What's on your mind?").fill('Half a thought before the tab closed');
    // Reload immediately, inside the autosave delay: the rescue copy
    // written as the page closes is what keeps this.
    await page.reload();

    await page.goto('./#/new');
    await expect(page.getByLabel("What's on your mind?")).toHaveValue('Half a thought before the tab closed');
    await expect(page.getByText(/restored your unsaved draft/i)).toBeVisible();
  });

  test('Use my location fills in the weather', async ({ page }) => {
    await page.goto('./#/new');
    await page.getByRole('button', { name: 'Use my current location for the weather' }).click();

    await expect(page.getByText('Hyderabad, India', { exact: true })).toBeVisible();
    await expect(page.getByText('29°C').first()).toBeVisible();
  });

  test('a past date gets that day’s weather from history', async ({ page }) => {
    await page.goto('./#/new');
    await page.locator('#dateInput').fill('2024-03-10T09:30');
    await expect(page.getByText(/looks up the actual weather on/i)).toBeVisible();

    await page.locator('#locationInput').fill('Hyderabad');
    await page.getByRole('button', { name: 'Fetch weather data for entered location' }).click();

    // The archive (faked as 18°C, clouds) answers for older dates.
    await expect(page.getByText('18°C')).toBeVisible();
    await expect(page.getByText(/weather updated for hyderabad, india on/i)).toBeVisible();
  });

  test('the calendar shows a mood on days with entries', async ({ page }) => {
    await seedEntries(page, [{ id: 1, content: 'Good day', mood: 'Happy', date: daysAgo(0, 9) }]);
    await goTo(page, 'Calendar');

    await expect(page.getByRole('link', { name: /entry logged, mood happy/i })).toBeVisible();
  });
});
