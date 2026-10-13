import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../src/context/ThemeContext.jsx';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';
import { EntriesProvider } from '../../src/context/EntriesContext.jsx';
import { saveEntries } from '../../src/lib/storage.js';

// Puts entries straight into the (fake) IndexedDB before the app loads.
export function seedEntries(entries) {
  return saveEntries(entries, []);
}

export async function waitForJournal() {
  await waitFor(() => expect(screen.queryByText('Opening your journal…')).not.toBeInTheDocument());
}

// Renders `ui` inside the app's providers and a router, and waits until the
// journal has finished loading from storage.
export async function renderWithJournal(ui, { initialEntries = ['/'] } = {}) {
  const view = render(
    <ThemeProvider>
      <AnnouncerProvider>
        <EntriesProvider>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </EntriesProvider>
      </AnnouncerProvider>
    </ThemeProvider>,
  );
  await waitForJournal();
  return view;
}

// The raw records in IndexedDB, to check what's actually stored on disk.
export function rawRecords(storeName = 'entries') {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('weatherJournal');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    };
  });
}

export function quotaError() {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}
