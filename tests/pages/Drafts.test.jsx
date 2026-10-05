import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { EntryFormPage } from '../../src/pages/EntryFormPage.jsx';
import { loadDraft, loadEntries } from '../../src/lib/storage.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function renderPage(path = '/new') {
  return renderWithJournal(
    <Routes>
      <Route path="/new" element={<EntryFormPage />} />
      <Route path="/edit/:id" element={<EntryFormPage />} />
      <Route path="/" element={<p>Dashboard</p>} />
    </Routes>,
    { initialEntries: [path] },
  );
}

function textarea() {
  return screen.findByLabelText(/what's on your mind/i);
}

// Write something, then leave the page without saving.
async function writeAndLeave(user, text, path = '/new') {
  const view = await renderPage(path);
  await user.type(await textarea(), text);
  view.unmount(); // flushes the pending draft
  await waitFor(async () => expect(await loadDraft(path === '/new' ? 'new' : path.split('/')[2])).not.toBeNull());
}

describe('Drafts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores unsaved writing when you come back', async () => {
    const user = userEvent.setup();
    await writeAndLeave(user, 'Half a thought');

    await renderPage();

    expect(await textarea()).toHaveValue('Half a thought');
    expect(screen.getByRole('status')).toHaveTextContent(/restored your unsaved draft from/i);
  });

  it('keeps the mood and tags too', async () => {
    const user = userEvent.setup();
    const view = await renderPage();
    await user.type(await textarea(), 'With extras');
    await user.click(screen.getByLabelText(/peaceful/i));
    await user.type(screen.getByLabelText(/tags/i), 'calm, tea');
    view.unmount();
    await waitFor(async () => expect(await loadDraft('new')).toMatchObject({ mood: 'Peaceful' }));

    await renderPage();

    expect(await screen.findByLabelText(/peaceful/i)).toBeChecked();
    expect(screen.getByLabelText(/tags/i)).toHaveValue('calm, tea');
  });

  it('Discard draft starts fresh', async () => {
    const user = userEvent.setup();
    await writeAndLeave(user, 'Never mind');
    await renderPage();
    await textarea();

    await user.click(screen.getByRole('button', { name: 'Discard draft' }));

    expect(await textarea()).toHaveValue('');
    expect(screen.queryByText(/restored your unsaved draft/i)).not.toBeInTheDocument();
    await waitFor(async () => expect(await loadDraft('new')).toBeNull());
  });

  it('clears the draft once the entry is saved', async () => {
    const user = userEvent.setup();
    await writeAndLeave(user, 'Finished now');
    await renderPage();
    await textarea();

    await user.click(screen.getByRole('button', { name: /save entry/i }));

    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect((await loadEntries()).map((e) => e.content)).toEqual(['Finished now']);
    await waitFor(async () => expect(await loadDraft('new')).toBeNull());
  });

  it('Cancel throws the draft away', async () => {
    const user = userEvent.setup();
    await writeAndLeave(user, 'Not this one');
    await renderPage();
    await textarea();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(async () => expect(await loadDraft('new')).toBeNull());
  });

  it('keeps a separate draft for edits to an existing entry', async () => {
    const user = userEvent.setup();
    await seedEntries([{ id: 42, content: 'Original', date: '2026-10-01T10:00' }]);
    await writeAndLeave(user, ' plus more', '/edit/42');

    await renderPage('/edit/42');

    expect(await textarea()).toHaveValue('Original plus more');
    expect(await loadDraft('new')).toBeNull();
  });

  it('does not create a draft just by opening the form', async () => {
    const view = await renderPage();
    await textarea();
    view.unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(await loadDraft('new')).toBeNull();
  });
});
