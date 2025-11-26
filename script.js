const STORAGE_KEY = 'weatherJournalEntries';

function loadEntries() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatDateForCard(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  const day = d.getDate().toString().padStart(2,'0');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

// Assign unique IDs to old entries if missing
function ensureIDs() {
  const entries = loadEntries();
  let changed = false;
  entries.forEach(entry => {
    if (!entry.id) {
      entry.id = Date.now() + Math.random();
      changed = true;
    }
  });
  if (changed) saveEntries(entries);
}

function renderEntries() {
  const container = document.getElementById('entriesContainer');
  if (!container) return;

  const entries = loadEntries();
  container.innerHTML = '';

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No entries yet. Create a new one to get started!';
    empty.style.color = '#fff';
    container.appendChild(empty);
    return;
  }

  entries
    .slice()
    .sort((a,b)=> new Date(b.date)-new Date(a.date))
    .forEach(entry => {
      const card = document.createElement('div');
      card.className = 'card' + (entry.background === 'peach' ? ' peach' : '');

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', ()=>{
        const all = loadEntries();
        const updated = all.filter(item => item.id !== entry.id);
        saveEntries(updated);
        renderEntries();
      });

      const title = document.createElement('h2'); title.textContent = entry.title;
      const date = document.createElement('div'); date.className='date'; date.textContent = formatDateForCard(entry.date);
      const weatherRow = document.createElement('div'); weatherRow.className='weather-row';
      weatherRow.innerHTML=`<span class="icon">${entry.weatherIcon||'⛅'}</span> <span>${entry.temperature||''}</span> <span class="small-text">${entry.weatherType||''}</span>`;
      const content = document.createElement('p'); content.className='small-text'; content.textContent=entry.content;
      const tagsDiv = document.createElement('div'); tagsDiv.className='tags';
      (entry.tags||[]).forEach(tag=>{
        const span=document.createElement('span'); span.className='tag'; span.textContent=tag;
        tagsDiv.appendChild(span);
      });

      card.appendChild(deleteBtn);
      card.appendChild(title);
      card.appendChild(date);
      card.appendChild(weatherRow);
      card.appendChild(content);
      card.appendChild(tagsDiv);

      container.appendChild(card);
    });
}

function initEntryForm() {
  const form = document.getElementById('entryForm');
  if (!form) return;

  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const title = document.getElementById('titleInput').value.trim();
    const date = document.getElementById('dateInput').value;
    const mood = document.getElementById('moodInput').value;
    const content = document.getElementById('contentInput').value.trim();
    const tagsRaw = document.getElementById('tagsInput').value;
    const background = document.getElementById('backgroundInput').value;
    const font = document.getElementById('fontInput').value;

    if(!title||!date||!mood||!content){
      alert('Please fill in the title, date, mood and content.');
      return;
    }

    const tags = tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);
    const entries = loadEntries();
    entries.push({
      id: Date.now() + Math.random(),
      title,
      date,
      mood,
      content,
      tags,
      background,
      font,
      weatherIcon:'⛅',
      temperature:'26°C',
      weatherType:'Clouds'
    });
    saveEntries(entries);
    window.location.href='index.html';
  });
}

window.addEventListener('DOMContentLoaded', ()=>{
  ensureIDs();
  renderEntries();
  initEntryForm();
});
