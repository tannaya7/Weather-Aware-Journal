import AxeBuilder from '@axe-core/playwright';
import { test, expect, daysAgo, seedEntries } from './fixtures.js';

const PAGES = [
  ['Home', './#/'],
  ['Write', './#/new'],
  ['Entry', './#/entry/1'],
  ['Calendar', './#/calendar'],
  ['Insights', './#/insights'],
  ['Map', './#/map'],
  ['Export', './#/export'],
  ['Contact', './#/contact'],
  ['Settings', './#/settings'],
];

const ENTRIES = [
  {
    id: 1,
    content: '# A good day\nWent for a **long** walk.\n- [x] walk\n- [ ] read',
    mood: 'Happy',
    weatherType: 'Clear sky',
    weatherIcon: '☀️',
    temperature: '28°C',
    locationName: 'Hyderabad, India',
    latitude: 17.385,
    longitude: 78.4867,
    sunrise: '06:04',
    sunset: '18:14',
    daylightHours: 12.2,
    airQuality: 40,
    tags: ['walks'],
    habits: { sleep: 8, exercise: true },
    date: daysAgo(1),
  },
  { id: 2, content: 'Rainy and slow', mood: 'Sad', weatherType: 'Rain', temperature: '18°C', date: daysAgo(8) },
];

// WCAG 2.1 A and AA, as checked by axe. The map's tiles come from Leaflet,
// which manages its own markup, so the map container is left out.
async function violations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.leaflet-container')
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

for (const theme of ['light', 'dark']) {
  test(`every page passes automated accessibility checks (${theme} theme)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript((t) => localStorage.setItem('weatherJournalTheme', t), theme);
    await seedEntries(page, ENTRIES);

    for (const [name, url] of PAGES) {
      await page.goto(url);
      await expect(page.locator('#main-content')).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await violations(page), `${name} (${theme})`).toEqual([]);
    }
  });
}
