import { test, expect, daysAgo, goTo, rawEntries, seedEntries } from './fixtures.js';

// Runs the real Web Crypto in a real browser: the unit tests use Node's.
test('passcode lock encrypts entries and opens only with the passcode', async ({ page }) => {
  await seedEntries(page, [{ id: 1, content: 'A very private thought', mood: 'Sad', date: daysAgo(1) }]);

  await goTo(page, 'Settings');
  await page.getByLabel('New passcode').fill('2468');
  await page.getByLabel('Repeat passcode').fill('2468');
  await page.getByRole('button', { name: 'Turn on passcode lock' }).click();
  await expect(page.getByRole('status')).toHaveText('Passcode lock is on. Your entries are now encrypted.');

  const onDisk = await rawEntries(page);
  expect(onDisk).not.toContain('private thought');
  expect(onDisk).toContain('"iv"');

  // Opening the app again asks for the passcode.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your journal is locked' })).toBeVisible();
  await expect(page.getByText('A very private thought')).toHaveCount(0);

  await page.getByLabel('Passcode').fill('0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toHaveText("That passcode isn't right.");

  await page.getByLabel('Passcode').fill('2468');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await goTo(page, 'Home');
  await expect(page.getByText('A very private thought')).toBeVisible();

  // Lock again from the sidebar.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Lock' }).click();
  await expect(page.getByRole('heading', { name: 'Your journal is locked' })).toBeVisible();

  expect(page.consoleErrors).toEqual([]);
});
