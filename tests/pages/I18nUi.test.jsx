import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppLayout } from '../../src/components/AppLayout/AppLayout.jsx';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { Settings } from '../../src/pages/Settings.jsx';
import { EntryFormPage } from '../../src/pages/EntryFormPage.jsx';
import { LANGUAGES, MESSAGES } from '../../src/i18n/messages.js';
import { initialLanguage, translate } from '../../src/i18n/translate.js';
import { loadEntries } from '../../src/lib/storage.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function renderApp(path, language) {
  return renderWithJournal(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/new" element={<EntryFormPage />} />
      </Route>
    </Routes>,
    { initialEntries: [path], language },
  );
}

describe('translate', () => {
  it('fills in values and picks the plural form for the language', () => {
    expect(translate('en', 'dashboard.count', { count: 1 })).toBe('1 entry');
    expect(translate('en', 'dashboard.count', { count: 3 })).toBe('3 entries');
    expect(translate('es', 'dashboard.count', { count: 1 })).toBe('1 entrada');
    expect(translate('es', 'dashboard.count', { count: 1200 })).toBe('1200 entradas'.replace('1200', (1200).toLocaleString('es')));
    expect(translate('en', 'form.photosHint', { max: 4 })).toBe('(optional, up to 4)');
  });

  it('falls back to English for a missing word, and shows the key for an unknown one', () => {
    MESSAGES.en['test.onlyEnglish'] = 'Only in English';
    expect(translate('es', 'test.onlyEnglish')).toBe('Only in English');
    delete MESSAGES.en['test.onlyEnglish'];
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
  });

  it('has every English key in every language, and nothing extra', () => {
    const english = Object.keys(MESSAGES.en).sort();
    for (const { code } of LANGUAGES) {
      expect(Object.keys(MESSAGES[code]).sort()).toEqual(english);
      for (const [key, text] of Object.entries(MESSAGES[code])) {
        // Placeholders must match English, or values go missing.
        const holes = (t) => (t.match(/\{\w+\}/g) || []).sort().join();
        expect(holes(text), `${code} ${key}`).toBe(holes(MESSAGES.en[key]));
      }
    }
  });

  it('starts in the saved language, else the browser’s, else English', () => {
    localStorage.clear();
    expect(initialLanguage(['hi-IN', 'en'])).toBe('hi');
    expect(initialLanguage(['fr-FR', 'es-MX'])).toBe('es');
    expect(initialLanguage(['de'])).toBe('en');
    localStorage.setItem('weatherJournalLanguage', 'es');
    expect(initialLanguage(['hi'])).toBe('es');
    localStorage.setItem('weatherJournalLanguage', 'xx');
    expect(initialLanguage([])).toBe('en');
  });
});

describe('Language in the app', () => {
  beforeEach(() => localStorage.clear());

  it('switches the menus from Settings, remembers it, and sets the page language', async () => {
    const user = userEvent.setup();
    await renderApp('/settings', 'en');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('App language'), 'es');

    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getByRole('link', { name: /Ajustes/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem('weatherJournalLanguage')).toBe('es');
  });

  it('shows the dashboard in Hindi', async () => {
    await seedEntries([{ id: 1, content: 'नमस्ते', date: '2026-10-01T10:00' }]);
    await renderApp('/', 'hi');
    expect(screen.getByRole('heading', { name: 'आपकी डायरी' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'डायरी में खोजें' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'नई डायरी एंट्री लिखें' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('hi');
  });

  it('labels the editor in the chosen language, and never changes what was written', async () => {
    const user = userEvent.setup();
    await renderApp('/new', 'es');
    const box = await screen.findByLabelText('¿Qué tienes en mente?');
    await user.type(box, 'Hello in my own words');
    await user.click(screen.getByRole('button', { name: 'Guardar entrada' }));
    await waitFor(async () => expect((await loadEntries())[0].content).toBe('Hello in my own words'));
  });
});

describe('Editor accessibility', () => {
  beforeEach(() => localStorage.clear());

  it('shows the empty-entry error next to the field and ties it to the field', async () => {
    const user = userEvent.setup();
    await renderApp('/new', 'en');
    const box = await screen.findByLabelText("What's on your mind?");
    await user.click(screen.getByRole('button', { name: 'Save Entry' }));
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription('Write something before saving.');
    expect(box).toHaveFocus();
    await user.type(box, 'x');
    await user.click(screen.getByRole('button', { name: 'Save Entry' }));
    await waitFor(async () => expect(await loadEntries()).toHaveLength(1));
  });

  it('saves with Ctrl+Enter, and the save button says so', async () => {
    const user = userEvent.setup();
    await renderApp('/new', 'en');
    const box = await screen.findByLabelText("What's on your mind?");
    const save = screen.getByRole('button', { name: 'Save Entry' });
    expect(save).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
    expect(save).toHaveAccessibleDescription(/Ctrl\+Enter/);
    await user.type(box, 'Quick note');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(async () => expect((await loadEntries()).map((e) => e.content)).toEqual(['Quick note']));
  });

  it('does not save on a plain Enter (that makes a new line)', async () => {
    const user = userEvent.setup();
    await renderApp('/new', 'en');
    const box = await screen.findByLabelText("What's on your mind?");
    await user.type(box, 'Line one{Enter}Line two');
    expect(box).toHaveValue('Line one\nLine two');
    expect(await loadEntries()).toHaveLength(0);
  });
});
