import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { EntryDetail } from '../../src/pages/EntryDetail.jsx';
import { EntryFormPage } from '../../src/pages/EntryFormPage.jsx';
import { loadEntries } from '../../src/lib/storage.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function renderAt(path) {
  return renderWithJournal(
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/entry/:id" element={<EntryDetail />} />
      <Route path="/edit/:id" element={<EntryFormPage />} />
    </Routes>,
    { initialEntries: [path] },
  );
}

const WITH_HISTORY = {
  id: 1,
  content: 'The third draft of my day',
  mood: 'Happy',
  date: '2026-10-01T10:00',
  updatedAt: Date.UTC(2026, 9, 3),
  history: [
    { content: 'The second draft of my day', mood: 'Happy', date: '2026-10-01T10:00', savedAt: Date.UTC(2026, 9, 2), source: 'edit', replacedAt: Date.UTC(2026, 9, 3) },
    { content: 'The first draft', mood: 'Sad', tags: ['draft'], date: '2026-10-01T10:00', savedAt: Date.UTC(2026, 9, 1), source: 'sync' },
  ],
};

const CLASHED = {
  id: 2,
  content: 'Walked to the lake with Sam',
  mood: 'Happy',
  date: '2026-10-02T10:00',
  updatedAt: Date.UTC(2026, 9, 4),
  conflict: { at: Date.UTC(2026, 9, 4), otherSavedAt: Date.UTC(2026, 9, 3) },
  history: [
    { content: 'Walked to the park alone', mood: 'Sad', date: '2026-10-02T10:00', savedAt: Date.UTC(2026, 9, 3), source: 'conflict' },
  ],
};

describe('Earlier versions', () => {
  beforeEach(() => localStorage.clear());

  it('lists them newest first, with where each came from', async () => {
    await seedEntries([WITH_HISTORY]);
    await renderAt('/entry/1');
    const history = screen.getByText('Earlier versions (2)').closest('details');
    const items = within(history).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('The second draft of my day');
    expect(items[0]).toHaveTextContent('Edited on this device');
    expect(items[1]).toHaveTextContent('Replaced by a newer version from another device');
  });

  it('shows no history section for an entry that has none', async () => {
    await seedEntries([{ id: 1, content: 'Plain', date: '2026-10-01T10:00' }]);
    await renderAt('/entry/1');
    expect(screen.queryByText(/Earlier versions/)).not.toBeInTheDocument();
  });

  it('shows the changes between a version and the current one, without relying on color', async () => {
    const user = userEvent.setup();
    await seedEntries([WITH_HISTORY]);
    await renderAt('/entry/1');
    const history = screen.getByText('Earlier versions (2)').closest('details');
    await user.click(within(history).getAllByRole('button', { name: 'Show changes' })[0]);
    const diff = within(history).getByLabelText('Changes from this version to the current one');
    expect(diff.querySelector('del')).toHaveTextContent('second');
    expect(diff.querySelector('ins')).toHaveTextContent('third');
    expect(diff).toHaveTextContent('[removed: second]');
    expect(diff).toHaveTextContent('[added: third]');
    await user.click(within(history).getByRole('button', { name: 'Hide changes' }));
    expect(within(history).queryByLabelText(/Changes from this version/)).not.toBeInTheDocument();
  });

  it('restores a version, and keeps what it replaced so the restore can be undone', async () => {
    const user = userEvent.setup();
    await seedEntries([WITH_HISTORY]);
    await renderAt('/entry/1');
    const history = screen.getByText('Earlier versions (2)').closest('details');

    await user.click(within(history).getAllByRole('button', { name: 'Restore this version' })[1]);

    await waitFor(async () => {
      const [saved] = await loadEntries();
      expect(saved.content).toBe('The first draft');
      expect(saved.mood).toBe('Sad');
      expect(saved.tags).toEqual(['draft']);
      expect(saved.history.map((v) => v.content)).toContain('The third draft of my day');
    });
  });

  it('records the earlier writing when an entry is edited and saved', async () => {
    const user = userEvent.setup();
    await seedEntries([{ id: 1, content: 'Before the edit', mood: 'Happy', date: '2026-10-01T10:00', updatedAt: 1000 }]);
    await renderAt('/edit/1');

    const box = await screen.findByLabelText(/what's on your mind/i);
    await user.clear(box);
    await user.type(box, 'After the edit');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(async () => {
      const [saved] = await loadEntries();
      expect(saved.content).toBe('After the edit');
      expect(saved.history).toHaveLength(1);
      expect(saved.history[0]).toMatchObject({ content: 'Before the edit', source: 'edit', savedAt: 1000 });
    });
  });

  it('does not add history when only non-writing details change', async () => {
    const user = userEvent.setup();
    // Its own id: the test before also edits entry 1, and the draft it saves
    // as it closes must not be picked up here.
    await seedEntries([{ id: 7, content: 'Same words', mood: 'Happy', date: '2026-10-01T10:00', updatedAt: 1000 }]);
    await renderAt('/edit/7');
    await screen.findByLabelText(/what's on your mind/i);
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(async () => expect((await loadEntries())[0].updatedAt).toBeGreaterThan(1000));
    expect((await loadEntries())[0].history).toBeUndefined();
  });
});

describe('Entries edited on two devices', () => {
  beforeEach(() => localStorage.clear());

  it('shows a notice on the entry and a marker on the timeline', async () => {
    await seedEntries([CLASHED, WITH_HISTORY]);
    const view = await renderAt('/');
    expect(screen.getAllByText(/Edited on two devices: needs a look/)).toHaveLength(1);
    view.unmount();

    await renderAt('/entry/2');
    const notice = screen.getByRole('region', { name: 'Edited on two devices at once' });
    expect(within(notice).getByText(/Nothing was lost/)).toBeInTheDocument();
  });

  it('compares the two versions', async () => {
    const user = userEvent.setup();
    await seedEntries([CLASHED]);
    await renderAt('/entry/2');
    const notice = screen.getByRole('region', { name: 'Edited on two devices at once' });
    await user.click(within(notice).getByRole('button', { name: 'Compare the two versions' }));
    const diff = within(notice).getByLabelText('Changes from the other version to the current one');
    expect(diff).toHaveTextContent('[removed: park alone]');
    expect(diff).toHaveTextContent('[added: lake with Sam]');
  });

  it('keep this version: clears the notice and keeps the writing', async () => {
    const user = userEvent.setup();
    await seedEntries([CLASHED]);
    await renderAt('/entry/2');
    await user.click(screen.getByRole('button', { name: 'Keep this version' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Edited on two devices at once' })).not.toBeInTheDocument());
    const [saved] = await loadEntries();
    expect(saved.content).toBe('Walked to the lake with Sam');
    expect(saved.conflict).toBeUndefined();
    expect(saved.updatedAt).toBeGreaterThan(CLASHED.updatedAt); // so other devices see it settled
  });

  it('use the other version: brings it back and clears the notice', async () => {
    const user = userEvent.setup();
    await seedEntries([CLASHED]);
    await renderAt('/entry/2');
    await user.click(screen.getByRole('button', { name: 'Use the other version' }));
    await waitFor(async () => {
      const [saved] = await loadEntries();
      expect(saved.content).toBe('Walked to the park alone');
      expect(saved.mood).toBe('Sad');
      expect(saved.conflict).toBeUndefined();
      expect(saved.history.map((v) => v.content)).toContain('Walked to the lake with Sam');
    });
    expect(screen.queryByRole('region', { name: 'Edited on two devices at once' })).not.toBeInTheDocument();
  });

  it('keep both: puts the other version below the current one', async () => {
    const user = userEvent.setup();
    await seedEntries([CLASHED]);
    await renderAt('/entry/2');
    await user.click(screen.getByRole('button', { name: 'Keep both' }));
    await waitFor(async () => {
      const [saved] = await loadEntries();
      expect(saved.content).toBe('Walked to the lake with Sam\n\n---\n\nWalked to the park alone');
      expect(saved.conflict).toBeUndefined();
    });
  });
});
