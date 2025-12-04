import { ensureIDs, renderEntries, initDashboardInteractions } from './entries.js';
import { initEntryForm } from './form.js';
import { initWeatherBox } from './weather.js';
import { initA11y } from './a11y.js';

// Initialize the app when the DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    initA11y();                // Initialize accessibility features
    ensureIDs();              // Fix any missing IDs
    renderEntries();          // Show entries on the dashboard (if present)
    initDashboardInteractions(); // Wire up search / sort / filters on the main page
    initEntryForm();          // Setup form listener if on the new entry page
    initWeatherBox();         // Enable weather fetching if the weather box exists
});
