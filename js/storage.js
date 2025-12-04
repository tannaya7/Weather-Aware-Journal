// Key used for local storage - keeping it simple
const STORAGE_KEY = 'weatherJournalEntries';

// Helper to get entries from local storage
// Returns an empty array if nothing is found or if parsing fails
export function loadEntries() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        const data = JSON.parse(raw);
        // Make sure we actually got an array back
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn("Failed to parse entries", e);
        return [];
    }
}

// Save the current list of entries back to storage
export function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}
