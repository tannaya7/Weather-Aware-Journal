import { loadEntries, saveEntries } from './storage.js';
import { getLastFetchedWeather } from './weather.js';
import { announce } from './a11y.js';

export function initEntryForm() {
    const form = document.getElementById('entryForm');
    if (!form) return; // Not on the form page

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Clear previous errors
        clearFormErrors();

        // Grab all values from the form
        const title = document.getElementById('titleInput').value.trim();
        const date = document.getElementById('dateInput').value;
        const mood = document.getElementById('moodInput').value;
        const content = document.getElementById('contentInput').value.trim();
        const tagsRaw = document.getElementById('tagsInput').value;
        const background = document.getElementById('backgroundInput').value;
        const font = document.getElementById('fontInput').value;

        // Accessible validation
        const errors = [];
        if (!title) errors.push({ field: 'titleInput', message: 'Title is required' });
        if (!date) errors.push({ field: 'dateInput', message: 'Date is required' });
        if (!mood) errors.push({ field: 'moodInput', message: 'Mood is required' });
        if (!content) errors.push({ field: 'contentInput', message: 'Content is required' });

        if (errors.length > 0) {
            showFormErrors(errors);
            // Focus first error field
            const firstErrorField = document.getElementById(errors[0].field);
            if (firstErrorField) firstErrorField.focus();
            return;
        }

        // Process tags: split by comma and remove empty spaces
        const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

        const entries = loadEntries();
        const locationInput = document.getElementById('locationInput');
        const weather = getLastFetchedWeather() || {};

        // Add the new entry, using live weather data when available
        entries.push({
            id: Date.now() + Math.random(), // Unique ID
            title,
            date,
            mood,
            content,
            tags,
            background,
            font,
            weatherIcon: weather.icon || '⛅',
            temperature: weather.temperature || '26°C',
            weatherType: weather.weatherType || 'Clouds',
            humidity: typeof weather.humidity === 'number' ? weather.humidity : undefined,
            windSpeed: typeof weather.windSpeed === 'number' ? weather.windSpeed : undefined,
            locationName: weather.locationName || (locationInput ? locationInput.value.trim() : '')
        });

        saveEntries(entries);
        announce('Journal entry created successfully.', 'assertive');

        // Go back to the dashboard
        window.location.href = 'index.html';
    });
}

function clearFormErrors() {
    const errorRegion = document.getElementById('formErrors');
    if (errorRegion) errorRegion.textContent = '';

    // Clear aria-invalid and error styling
    ['titleInput', 'dateInput', 'moodInput', 'contentInput'].forEach(id => {
        const field = document.getElementById(id);
        if (field) {
            field.setAttribute('aria-invalid', 'false');
            field.style.borderColor = '';
        }
    });
}

function showFormErrors(errors) {
    const errorRegion = document.getElementById('formErrors');
    if (errorRegion) {
        const errorMessages = errors.map(e => e.message).join('. ');
        errorRegion.textContent = `Form has ${errors.length} error${errors.length > 1 ? 's' : ''}: ${errorMessages}`;
        announce(`Form validation failed. ${errorMessages}`, 'assertive');
    }

    // Mark fields as invalid
    errors.forEach(error => {
        const field = document.getElementById(error.field);
        if (field) {
            field.setAttribute('aria-invalid', 'true');
            field.style.borderColor = '#ff4d4d';
        }
    });
}
