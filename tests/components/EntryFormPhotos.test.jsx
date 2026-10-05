import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryForm } from '../../src/components/EntryForm/EntryForm.jsx';
import { EntryFormPage } from '../../src/pages/EntryFormPage.jsx';
import { EntryDetail } from '../../src/pages/EntryDetail.jsx';
import { ThemeProvider } from '../../src/context/ThemeContext.jsx';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';
import { EntriesProvider } from '../../src/context/EntriesContext.jsx';

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
    render(
      <ThemeProvider>
        <AnnouncerProvider>
          <EntriesProvider>
            <MemoryRouter initialEntries={['/new']}>
              <Routes>
                <Route path="/new" element={<EntryFormPage />} />
                <Route path="/" element={<p>Dashboard</p>} />
              </Routes>
            </MemoryRouter>
          </EntriesProvider>
        </AnnouncerProvider>
      </ThemeProvider>,
    );

    await user.type(screen.getByLabelText(/what's on your mind/i), 'Will not fit');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await user.click(screen.getByRole('button', { name: /save entry/i }));
    spy.mockRestore();

    expect(screen.getByRole('alert')).toHaveTextContent(/out of storage space/);
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/what's on your mind/i)).toHaveValue('Will not fit');
  });
});

describe('EntryDetail photos', () => {
  it('shows every photo on the entry', () => {
    localStorage.setItem(
      'weatherJournalEntries',
      JSON.stringify([{ id: 7, content: 'Trip', date: '2026-01-01T10:00', images: ['data:a', 'data:b', 'data:c'] }]),
    );
    render(
      <ThemeProvider>
        <AnnouncerProvider>
          <EntriesProvider>
            <MemoryRouter initialEntries={['/entry/7']}>
              <Routes>
                <Route path="/entry/:id" element={<EntryDetail />} />
              </Routes>
            </MemoryRouter>
          </EntriesProvider>
        </AnnouncerProvider>
      </ThemeProvider>,
    );

    const srcs = [...document.querySelectorAll('article img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual(['data:a', 'data:b', 'data:c']);
  });
});
