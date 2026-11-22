import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../src/context/ThemeContext.jsx';
import { I18nProvider } from '../../src/i18n/I18nContext.jsx';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';
import { EntriesProvider } from '../../src/context/EntriesContext.jsx';
import { SemanticProvider } from '../../src/context/SemanticContext.jsx';
import { saveEntries } from '../../src/lib/storage.js';
import { MESSAGES } from '../../src/i18n/messages.js';

// Puts entries straight into the (fake) IndexedDB before the app loads.
export function seedEntries(entries) {
  return saveEntries(entries, []);
}

// The "opening" text is in the app's language, so wait for it to be gone in
// every language (a Hindi or Spanish test would otherwise not wait at all).
const OPENING_TEXTS = Object.values(MESSAGES).map((messages) => messages['journal.opening']);

export async function waitForJournal() {
  await waitFor(() => {
    for (const text of OPENING_TEXTS) expect(screen.queryByText(text)).not.toBeInTheDocument();
  });
}

// Renders `ui` inside the app's providers and a router, and waits until the
// journal has finished loading from storage.
export async function renderWithJournal(ui, { initialEntries = ['/'], language = 'en' } = {}) {
  const view = render(
    <I18nProvider initial={language}>
      <ThemeProvider>
        <AnnouncerProvider>
          <EntriesProvider>
            <SemanticProvider>
              <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
            </SemanticProvider>
          </EntriesProvider>
        </AnnouncerProvider>
      </ThemeProvider>
    </I18nProvider>,
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
