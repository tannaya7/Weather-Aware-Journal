import { loadEntries, saveEntries } from './storage.js';
import { formatDateForCard } from './utils.js';

// We need to make sure every entry has an ID so we can delete them later.
// This runs on load just in case old data is missing IDs.
export function ensureIDs() {
    const entries = loadEntries();
    let hasChanges = false;

    entries.forEach(entry => {
        if (!entry.id) {
            entry.id = Date.now() + Math.random(); // Simple unique ID generation
            hasChanges = true;
        }
    });

    if (hasChanges) {
        saveEntries(entries);
    }
}

// Main function to display all the journal entries
export function renderEntries() {
    const container = document.getElementById('entriesContainer');
    if (!container) return; // Guard clause if we're not on the dashboard

    const entries = loadEntries();
    container.innerHTML = '';

    // Show a friendly message if there are no entries
    if (entries.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = 'No entries yet. Create a new one to get started!';
        emptyMsg.style.color = '#fff';
        container.appendChild(emptyMsg);
        return;
    }

    // Sort by date (newest first) and render each card
    entries
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(entry => {
            const card = document.createElement('div');
            // Add the 'peach' class if that background was selected
            card.className = 'card' + (entry.background === 'peach' ? ' peach' : '');

            // Delete button logic
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => {
                const allEntries = loadEntries();
                const updatedEntries = allEntries.filter(item => item.id !== entry.id);
                saveEntries(updatedEntries);
                renderEntries(); // Re-render to show changes
            });

            // Build the card content
            const title = document.createElement('h2');
            title.textContent = entry.title;

            const date = document.createElement('div');
            date.className = 'date';
            date.textContent = formatDateForCard(entry.date);

            const weatherRow = document.createElement('div');
            weatherRow.className = 'weather-row';
            // Using default values if weather info is missing
            weatherRow.innerHTML = `
        <span class="icon">${entry.weatherIcon || '⛅'}</span> 
        <span>${entry.temperature || ''}</span> 
        <span class="small-text">${entry.weatherType || ''}</span>
      `;

            const content = document.createElement('p');
            content.className = 'small-text';
            content.textContent = entry.content;

            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'tags';

            // Render tags if they exist
            (entry.tags || []).forEach(tag => {
                const span = document.createElement('span');
                span.className = 'tag';
                span.textContent = tag;
                tagsDiv.appendChild(span);
            });

            // Assemble the card
            card.appendChild(deleteBtn);
            card.appendChild(title);
            card.appendChild(date);
            card.appendChild(weatherRow);
            card.appendChild(content);
            card.appendChild(tagsDiv);

            container.appendChild(card);
        });
}
