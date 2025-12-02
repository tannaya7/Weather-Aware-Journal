import { loadEntries, saveEntries } from './storage.js';

export function initEntryForm() {
    const form = document.getElementById('entryForm');
    if (!form) return; // Not on the form page

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Grab all values from the form
        const title = document.getElementById('titleInput').value.trim();
        const date = document.getElementById('dateInput').value;
        const mood = document.getElementById('moodInput').value;
        const content = document.getElementById('contentInput').value.trim();
        const tagsRaw = document.getElementById('tagsInput').value;
        const background = document.getElementById('backgroundInput').value;
        const font = document.getElementById('fontInput').value;

        // Basic validation
        if (!title || !date || !mood || !content) {
            alert('Please fill in the title, date, mood and content.');
            return;
        }

        // Process tags: split by comma and remove empty spaces
        const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

        const entries = loadEntries();

        // Add the new entry
        entries.push({
            id: Date.now() + Math.random(), // Unique ID
            title,
            date,
            mood,
            content,
            tags,
            background,
            font,
            // Hardcoded weather for now as requested
            weatherIcon: '⛅',
            temperature: '26°C',
            weatherType: 'Clouds'
        });

        saveEntries(entries);

        // Go back to the dashboard
        window.location.href = 'index.html';
    });
}
