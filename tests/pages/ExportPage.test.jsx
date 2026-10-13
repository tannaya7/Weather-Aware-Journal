import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportPage } from '../../src/pages/ExportPage.jsx';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

const ENTRIES = [
  { id: 1, content: 'New year walk', mood: 'Happy', date: '2025-01-01T10:00', images: ['data:image/png;base64,AAA'] },
  { id: 2, content: 'Summer rain', mood: 'Sad', weatherType: 'Rain', weatherIcon: '🌧️', temperature: '18°C', date: '2025-07-04T18:00' },
  { id: 3, content: 'This year', date: '2026-02-02T09:00', tags: ['work'] },
];

// jsdom can't draw on a canvas, so fake the context and the PNG encoding.
function stubCanvas() {
  const ctx = new Proxy(
    { createLinearGradient: () => ({ addColorStop() {} }) },
    { get: (target, key) => target[key] ?? (() => {}) },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['png'], { type: 'image/png' })));
}

// jsdom has no object URLs. Defined for the whole file (not per test), so
// they still exist when the page unmounts after each test.
URL.createObjectURL = vi.fn(() => 'blob:review');
URL.revokeObjectURL = vi.fn();

function printArea() {
  return document.querySelector('.print-area');
}

describe('Export page', () => {
  beforeEach(() => {
    localStorage.clear();
    stubCanvas();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.className = '';
  });

  it('shows a year-in-review image for the latest year, with a download link', async () => {
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);

    const review = screen.getByRole('region', { name: 'Year in review' });
    expect(within(review).getByLabelText('Year')).toHaveValue('2026');

    const img = await within(review).findByRole('img', { name: /your 2026 in review: 1 entry over 1 day/i });
    expect(img).toHaveAttribute('src', 'blob:review');
    expect(within(review).getByRole('link', { name: 'Download image' })).toHaveAttribute(
      'download',
      'weather-journal-2026-in-review.png',
    );
  });

  it('switches years', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);

    const review = screen.getByRole('region', { name: 'Year in review' });
    await user.selectOptions(within(review).getByLabelText('Year'), '2025');

    expect(await within(review).findByRole('img', { name: /2 entries over 2 days, mostly happy/i })).toBeInTheDocument();
  });

  it('offers Share only where the browser can share files', async () => {
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: vi.fn() });
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);

    await screen.findByRole('link', { name: 'Download image' });
    expect(screen.getByRole('button', { name: 'Share…' })).toBeInTheDocument();
  });

  it('previews the printable journal, oldest first, for the chosen range', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);

    const titles = () => [...printArea().querySelectorAll('h2')].map((h) => h.textContent);
    expect(titles()).toEqual(['New year walk', 'Summer rain', 'This year']);
    expect(printArea()).toHaveTextContent('3 entries');

    await user.selectOptions(screen.getByLabelText('Entries'), '2025');
    expect(titles()).toEqual(['New year walk', 'Summer rain']);
    expect(within(printArea()).getByRole('heading', { level: 1 })).toHaveTextContent('My 2025');
  });

  it('can leave photos out', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);

    expect(printArea().querySelectorAll('img')).toHaveLength(1);
    await user.click(screen.getByLabelText('Include photos'));
    expect(printArea().querySelectorAll('img')).toHaveLength(0);
  });

  it('prints only the journal, and puts the page back after printing', async () => {
    const user = userEvent.setup();
    const print = vi.fn(() => {
      expect(document.body).toHaveClass('printing-journal');
    });
    vi.stubGlobal('print', print);
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);

    await user.click(screen.getByRole('button', { name: 'Print or save as PDF' }));
    expect(print).toHaveBeenCalled();

    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(document.body).not.toHaveClass('printing-journal'));
  });

  it('has nothing to export without entries', async () => {
    await renderWithJournal(<ExportPage />);
    expect(screen.getByText(/your year in review will appear here/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing to print yet/i)).toBeInTheDocument();
  });
});
