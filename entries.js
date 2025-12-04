import { loadEntries, saveEntries } from './storage.js';
import { formatDateForCard } from './utils.js';
import { announce, focusTrap, manageFocusReturn } from './a11y.js';

// State for filters on the dashboard
let searchTerm = '';
let searchTimeout = null;
let sortOrder = 'newest'; // 'newest' | 'oldest'
let dateFilterMode = 'all'; // 'all' | 'today'
let currentPage = 1;
const itemsPerPage = 5;
let lastDeletedEntry = null;

// Internal helpers
function normalize(str) {
  return (str || '').toString().toLowerCase();
}

function isSameDay(dateString, refDate) {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (isNaN(d)) return false;
  return (
    d.getFullYear() === refDate.getFullYear() &&
    d.getMonth() === refDate.getMonth() &&
    d.getDate() === refDate.getDate()
  );
}

// Ensure every entry has an ID
export function ensureIDs() {
  const entries = loadEntries();
  let hasChanges = false;

  entries.forEach(entry => {
    if (!entry.id) {
      entry.id = Date.now() + Math.random();
      hasChanges = true;
    }
  });

  if (hasChanges) {
    saveEntries(entries);
  }
}

// Initialize dashboard interactions
export function initDashboardInteractions() {
  const searchInput = document.querySelector('.search');
  const sortSelect = document.querySelector('.filter');
  const calendarBtn = document.querySelector('.calender');
  const moodBtn = document.querySelector('.moodtr');

  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchTerm = normalize(event.target.value);
        currentPage = 1; // reset to first page
        renderEntries();
      }, 300); // 300ms debounce
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (event) => {
      const value = (event.target.value || '').toString().toLowerCase();
      sortOrder = value.includes('oldest') ? 'oldest' : 'newest';
      renderEntries();
    });
  }

  if (calendarBtn) {
    calendarBtn.addEventListener('click', () => {
      dateFilterMode = dateFilterMode === 'today' ? 'all' : 'today';
      calendarBtn.classList.toggle('toggle-active', dateFilterMode === 'today');
      calendarBtn.setAttribute('aria-pressed', dateFilterMode === 'today' ? 'true' : 'false');
      renderEntries();
    });
  }

  if (moodBtn) {
    moodBtn.addEventListener('click', () => {
      const isExpanded = moodBtn.getAttribute('aria-expanded') === 'true';
      moodBtn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
      showMoodSummary();
    });
  }
}

// Mood summary panel
function showMoodSummary() {
  const entries = loadEntries();
  if (!entries.length) {
    alert('No entries yet to analyse mood.');
    return;
  }

  let panel = document.getElementById('moodSummaryPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'moodSummaryPanel';
    panel.className = 'mood-summary-panel';
    document.body.appendChild(panel);
  }

  panel.innerHTML = '';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Mood summary for your journal entries');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'mood-summary-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close mood summary');
  closeBtn.addEventListener('click', () => {
    panel.classList.remove('visible');
    const moodBtn = document.querySelector('.moodtr');
    if (moodBtn) {
      moodBtn.setAttribute('aria-expanded', 'false');
      manageFocusReturn(moodBtn);
    }
    announce('Mood tracker closed');
  });

  const title = document.createElement('h3');
  title.textContent = 'Mood summary';

  const list = document.createElement('ul');
  list.className = 'mood-summary-list';

  const moodCounts = entries.reduce((acc, entry) => {
    const key = entry.mood || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  Object.entries(moodCounts).forEach(([mood, count]) => {
    const li = document.createElement('li');
    li.textContent = `${mood}: ${count}`;
    list.appendChild(li);
  });

  panel.appendChild(closeBtn);
  panel.appendChild(title);
  panel.appendChild(list);
  panel.classList.add('visible');

  // Set up focus trap and announce
  const cleanupFocus = focusTrap(panel);
  announce(`Mood summary opened. Showing ${Object.keys(moodCounts).length} different moods.`);

  // Cleanup focus trap when panel closes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class' && !panel.classList.contains('visible')) {
        cleanupFocus();
        observer.disconnect();
      }
    });
  });
  observer.observe(panel, { attributes: true });
}

// Delete entry with undo support
function deleteEntry(entryId) {
  const entries = loadEntries();
  lastDeletedEntry = entries.find(e => e.id === entryId);
  const updatedEntries = entries.filter(e => e.id !== entryId);
  saveEntries(updatedEntries);
  renderEntries();
  showUndoToast();
  announce(`Entry "${lastDeletedEntry?.title || 'Untitled'}" deleted. Undo available.`, 'assertive');
}

// Undo toast - persistent and visible
function showUndoToast() {
  let toast = document.getElementById('undoToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'undoToast';
    toast.className = 'undo-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = '#333';
    toast.style.color = '#fff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    toast.style.zIndex = '9999';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.fontSize = '14px';
    toast.style.cursor = 'default';

    const text = document.createElement('span');
    text.textContent = 'Entry deleted.';
    toast.appendChild(text);

    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Undo';
    undoBtn.setAttribute('aria-label', 'Undo delete entry');
    undoBtn.style.background = '#fff';
    undoBtn.style.color = '#333';
    undoBtn.style.border = 'none';
    undoBtn.style.padding = '5px 10px';
    undoBtn.style.borderRadius = '4px';
    undoBtn.style.cursor = 'pointer';
    undoBtn.addEventListener('click', () => {
      if (lastDeletedEntry) {
        const entries = loadEntries();
        entries.push(lastDeletedEntry);
        saveEntries(entries);
        announce(`Entry "${lastDeletedEntry.title || 'Untitled'}" restored.`);
        lastDeletedEntry = null;
        renderEntries();
        toast.style.display = 'none';
      }
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close undo notification');
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#fff';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.addEventListener('click', () => {
      toast.style.display = 'none';
    });

    toast.appendChild(undoBtn);
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);
  }

  toast.style.display = 'flex';
}


// Render entries with search, sort, pagination
export function renderEntries() {
  const container = document.getElementById('entriesContainer');
  if (!container) return;
  const liveRegion = document.getElementById('entryLiveRegion');

  let entries = loadEntries();

  // Apply search
  if (searchTerm) {
    entries = entries.filter(entry => {
      const haystack = [entry.title, entry.content, entry.mood, ...(entry.tags || [])].join(' ');
      return normalize(haystack).includes(searchTerm);
    });
  }

  // Apply date filter
  if (dateFilterMode === 'today') {
    const today = new Date();
    entries = entries.filter(entry => isSameDay(entry.date, today));
  }

  // Sort
  entries = entries.slice().sort((a, b) => {
    const aDate = new Date(a.date);
    const bDate = new Date(b.date);
    if (isNaN(aDate) || isNaN(bDate)) return 0;
    return sortOrder === 'oldest' ? aDate - bDate : bDate - aDate;
  });

  const totalPages = Math.ceil(entries.length / itemsPerPage);
  const paginatedEntries = entries.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  container.innerHTML = '';

  if (paginatedEntries.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.textContent = 'No entries yet. Create a new one to get started!';
    emptyMsg.style.color = '#fff';
    container.appendChild(emptyMsg);
  }

  paginatedEntries.forEach(entry => {
    if (liveRegion) liveRegion.textContent = `Loaded entry titled ${entry.title}`;

    const card = document.createElement('div');
    let extraClass = '';
    if (entry.background === 'peach') extraClass = ' peach';
    else if (entry.background === 'light-blue') extraClass = ' light-blue';
    else if (entry.background === 'dark') extraClass = ' dark';
    card.className = 'card' + extraClass;
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Journal entry titled ${entry.title}`);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', `Delete entry "${entry.title}"`);
    deleteBtn.addEventListener('click', () => deleteEntry(entry.id));
    deleteBtn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        deleteBtn.click();
      }
    });

    const titleEl = document.createElement('h2'); titleEl.textContent = entry.title;
    const dateEl = document.createElement('div'); dateEl.className = 'date'; dateEl.textContent = formatDateForCard(entry.date);
    const weatherRow = document.createElement('div'); weatherRow.className = 'weather-row';
    weatherRow.innerHTML = `<span class="icon">${entry.weatherIcon || '⛅'}</span> <span>${entry.temperature || ''}</span> <span class="small-text">${entry.weatherType || ''}</span>`;
    const content = document.createElement('p'); content.className = 'content-text'; content.textContent = entry.content;
    const tagsDiv = document.createElement('div'); tagsDiv.className = 'tags';
    (entry.tags || []).forEach(tag => {
      const span = document.createElement('span'); span.className = 'tag'; span.textContent = tag;
      tagsDiv.appendChild(span);
    });

    // Apply font style
    if (entry.font === 'serif') card.style.fontFamily = '"Georgia", "Times New Roman", serif';
    else if (entry.font === 'handwritten') card.style.fontFamily = '"Comic Sans MS", "Segoe Print", cursive';
    else if (entry.font === 'monospace') card.style.fontFamily = '"Fira Code", "Consolas", monospace';

    card.appendChild(deleteBtn);
    card.appendChild(titleEl);
    card.appendChild(dateEl);
    card.appendChild(weatherRow);
    card.appendChild(content);
    card.appendChild(tagsDiv);

    container.appendChild(card);
  });

  renderPagination(totalPages);
}

// Pagination buttons
function renderPagination(totalPages) {
  let container = document.getElementById('paginationContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'paginationContainer';
    container.className = 'pagination';
    document.querySelector('.container').appendChild(container);
  }

  container.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.disabled = i === currentPage;
    btn.addEventListener('click', () => {
      currentPage = i;
      renderEntries();
    });
    container.appendChild(btn);
  }
}
