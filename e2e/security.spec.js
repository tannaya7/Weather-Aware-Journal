import { test, expect, daysAgo, goTo, seedEntries } from './fixtures.js';

// Chrome's built-in virtual authenticator stands in for a fingerprint reader,
// including the PRF extension the passkey unlock relies on.
async function addVirtualAuthenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function turnOnPasscode(page, passcode) {
  await goTo(page, 'Settings');
  await page.getByLabel('New passcode').fill(passcode);
  await page.getByLabel('Repeat passcode').fill(passcode);
  await page.getByRole('button', { name: 'Turn on passcode lock' }).click();
  await expect(page.getByRole('status')).toHaveText(/Passcode lock is on/);
}

test('fingerprint or face unlock with a real WebAuthn passkey', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'virtual authenticator is Chromium-only');
  await addVirtualAuthenticator(page);
  await seedEntries(page, [{ id: 1, content: 'Opened by passkey', date: daysAgo(1) }]);
  await turnOnPasscode(page, '2468');

  await page.locator('#passkeyPasscode').fill('2468');
  await page.getByRole('button', { name: 'Set up fingerprint or face unlock' }).click();
  await expect(page.getByText('Fingerprint or face unlock is on.').first()).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: /unlock with fingerprint or face/i }).click();
  await goTo(page, 'Home');
  await expect(page.getByText('Opened by passkey')).toBeVisible();
  expect(page.consoleErrors).toEqual([]);
});

test('encrypted backup downloads and restores', async ({ page }) => {
  await seedEntries(page, [
    { id: 1, content: 'Backed up one', date: daysAgo(2) },
    { id: 2, content: 'Backed up two', date: daysAgo(1) },
  ]);
  await goTo(page, 'Export');

  await page.getByLabel('Backup password').first().fill('correct horse battery');
  await page.getByLabel('Repeat password').fill('correct horse battery');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^weather-journal-backup-\d{4}-\d{2}-\d{2}\.wjbackup$/);
  const backupPath = await download.path();

  // Start over with an empty journal, then restore.
  await page.evaluate(() => new Promise((r) => {
    const req = indexedDB.deleteDatabase('weatherJournal');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  }));
  await page.reload();
  await goTo(page, 'Export');
  await page.getByLabel('Backup file').setInputFiles(backupPath);
  await page.getByLabel('Backup password').nth(1).fill('correct horse battery');
  await page.getByRole('button', { name: 'Restore' }).click();

  await expect(page.getByText('Restored 2 entries.')).toBeVisible();
  await goTo(page, 'Home');
  await expect(page.getByText('Backed up two')).toBeVisible();
  expect(page.consoleErrors).toEqual([]);
});
