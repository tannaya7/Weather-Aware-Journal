import { test, expect, seedEntries } from './fixtures.js';

const WORDS = 'walk rain coffee work friends park river book music dinner tired sunny quiet busy family'.split(' ');
const MOODS = ['Happy', 'Peaceful', 'Sad', 'Excited', 'Angry', 'Anxious'];

function makeJournal(count) {
  const start = Date.now() - count * 86400000;
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    date: new Date(start + i * 86400000).toISOString(),
    content: `Day ${i} ${Array.from({ length: 60 }, (_, j) => WORDS[(i + j) % WORDS.length]).join(' ')}`,
    mood: MOODS[i % MOODS.length],
    weatherType: i % 3 ? 'Clear sky' : 'Rain',
    temperature: `${(i % 30) + 2}°C`,
    tags: [WORDS[i % WORDS.length]],
  }));
}

// About 8 years of daily entries: the app should still open and search
// without noticeable delay.
test('stays quick with 3,000 entries', async ({ page }) => {
  test.setTimeout(120000);
  await seedEntries(page, makeJournal(3000));

  const opened = Date.now();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your Journal' })).toBeVisible();
  expect(Date.now() - opened, 'time to open the journal').toBeLessThan(5000);

  const search = page.getByRole('textbox', { name: 'Search journal entries' });
  const typed = Date.now();
  await search.fill('"day 2999"');
  await expect(page.getByRole('status').filter({ hasText: /entr/ })).toHaveText('1 entry');
  // Includes the search box's 300ms debounce.
  expect(Date.now() - typed, 'time to show search results').toBeLessThan(2000);

  expect(page.consoleErrors).toEqual([]);
});
