import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryForm } from '../../src/components/EntryForm/EntryForm.jsx';
import { EntryFormPage } from '../../src/pages/EntryFormPage.jsx';
import { EntryDetail } from '../../src/pages/EntryDetail.jsx';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';
import { quotaError, renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function photo(name) {
  return new File([new Uint8Array(100)], `${name}.png`, { type: 'image/png' });
}

function photoInput() {
  return document.getElementById('imageInput');
}

function previews() {
  return document.querySelectorAll('form img');
}

function renderForm(props = {}) {
  const onSubmit = vi.fn();
  render(
    <AnnouncerProvider>
      <EntryForm mode="create" onSubmit={onSubmit} {...props} />
    </AnnouncerProvider>,
  );
  return { onSubmit };
}

describe('EntryForm photos', () => {
  it('adds several photos at once and saves them as images', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.upload(photoInput(), [photo('a'), photo('b')]);
    await waitFor(() => expect(previews()).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Add more photos' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/what's on your mind/i), 'Day out');
    await user.click(screen.getByRole('button', { name: /save entry/i }));

    const saved = onSubmit.mock.calls[0][0];
    expect(saved.images).toHaveLength(2);
    expect(saved.images[0]).toMatch(/^data:image\/png/);
    expect(saved.image).toBeUndefined();
  });

  it('stops at four photos and says why', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.upload(photoInput(), ['a', 'b', 'c', 'd', 'e'].map(photo));

    await waitFor(() => expect(previews()).toHaveLength(4));
    expect(screen.getByRole('alert')).toHaveTextContent('You can add up to 4 photos per entry.');
    expect(screen.queryByRole('button', { name: /add (more )?photos/i })).not.toBeInTheDocument();
  });

  it('removes a single photo', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.upload(photoInput(), [photo('a'), photo('b')]);
    await waitFor(() => expect(previews()).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));

    expect(previews()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Remove photo 2' })).not.toBeInTheDocument();
  });

  it("loads an older entry's single photo and saves it in the new format", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({
      mode: 'edit',
      initialEntry: { id: 1, content: 'Old', date: '2026-01-01T10:00', image: 'data:image/png;base64,OLD' },
    });

    expect(previews()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({ images: ['data:image/png;base64,OLD'], image: undefined });
  });
});

describe('Saving when storage is full', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps you on the form with a clear message', async () => {
    const user = userEvent.setup();
    await renderWithJournal(
      <Routes>
        <Route path="/new" element={<EntryFormPage />} />
        <Route path="/" element={<p>Dashboard</p>} />
      </Routes>,
      { initialEntries: ['/new'] },
    );

    await user.type(await screen.findByLabelText(/what's on your mind/i), 'Will not fit');
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw quotaError();
    });
    await user.click(screen.getByRole('button', { name: /save entry/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/out of storage space/);
    spy.mockRestore();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/what's on your mind/i)).toHaveValue('Will not fit');
    expect(screen.getByRole('button', { name: /save entry/i })).toBeEnabled();
  });
});

describe('EntryDetail photos', () => {
  it('shows every photo on the entry', async () => {
    await seedEntries([
      { id: 7, content: 'Trip', date: '2026-01-01T10:00', images: ['data:a', 'data:b', 'data:c'] },
    ]);
    await renderWithJournal(
      <Routes>
        <Route path="/entry/:id" element={<EntryDetail />} />
      </Routes>,
      { initialEntries: ['/entry/7'] },
    );

    const srcs = [...document.querySelectorAll('article img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['data:a', 'data:b', 'data:c']);
  });
});
