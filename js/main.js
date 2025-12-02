import { ensureIDs, renderEntries } from './entries.js';
import { initEntryForm } from './form.js';

// Initialize the app when the DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    ensureIDs();      // Fix any missing IDs
    renderEntries();  // Show entries on the dashboard
    initEntryForm();  // Setup form listener if on the new entry page
});
