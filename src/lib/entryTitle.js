import { formatDateForCard } from './dateFormat.js';

// A journal entry doesn't need an explicit title — like Apple Notes or Day
// One, it's derived from the first line of what you wrote. Entries created
// before this existed (or imported from elsewhere) may still carry an
// explicit `title`, which always wins.
export function getEntryTitle(entry, maxLength = 60) {
  if (!entry) return 'Untitled entry';

  if (entry.title && entry.title.trim()) return entry.title.trim();

  const firstLine = (entry.content || '').split('\n').find((line) => line.trim());
  if (firstLine) {
    const trimmed = firstLine.trim();
    return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
  }

  return formatDateForCard(entry.date) || 'Untitled entry';
}
