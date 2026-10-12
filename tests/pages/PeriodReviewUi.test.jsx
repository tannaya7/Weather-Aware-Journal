import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportPage } from '../../src/pages/ExportPage.jsx';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

// jsdom can't draw on a canvas, so fake the context and the PNG encoding.
function stubCanvas() {
  const ctx = new Proxy(
    { createLinearGradient: () => ({ addColorStop() {} }) },
    { get: (target, key) => target[key] ?? (() => {}) },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['png'], { type: 'image/png' })));
}

URL.createObjectURL = vi.fn(() => 'blob:review');
URL.revokeObjectURL = vi.fn();

// Weeks of Mon 12 Oct and Mon 5 Oct 2026; one entry in September.
const ENTRIES = [
  { id: 1, content: 'Sunny start', mood: 'Happy', date: '2026-10-12T10:00', weatherType: 'Clear sky', temperature: '20°C' },
  { id: 2, content: 'Rainy low', mood: 'Sad', date: '2026-10-13T10:00', weatherType: 'Rain', temperature: '9°C' },
  { id: 3, content: 'Last week', mood: 'Peaceful', date: '2026-10-06T10:00' },
  { id: 4, content: 'September note', mood: 'Happy', date: '2026-09-20T10:00' },
];

describe('Weekly & monthly review on the Export page', () => {
  beforeEach(() => {
    localStorage.clear();
    stubCanvas();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.className = '';
  });

  it('shows the latest week with its image, facts, and a download link', async () => {
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);
    const section = screen.getByRole('region', { name: /weekly & monthly review/i });

    expect(within(section).getByLabelText('Period').value).toMatch(/^w-\d+$/);
    expect(within(section).getByRole('option', { name: '12 Oct – 18 Oct 2026' }).selected).toBe(true);
    const img = await within(section).findByRole('img', { name: /review of 12 Oct – 18 Oct 2026: 2 entries over 2 days/i });
    expect(img).toHaveAttribute('src', 'blob:review');
    expect(within(section).getByText('Best day').nextSibling).toHaveTextContent('12 Oct · Great');
    expect(within(section).getByRole('link', { name: 'Download review image' })).toHaveAttribute(
      'download',
      expect.stringMatching(/^weather-journal-w-\d+-review\.png$/),
    );
  });

  it('switches to months and to another period', async () => {
    const user = userEvent.setup();
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);
    const section = screen.getByRole('region', { name: /weekly & monthly review/i });

    await user.selectOptions(within(section).getByLabelText('Review of a'), 'month');
    expect(within(section).getByRole('option', { name: 'October 2026' }).selected).toBe(true);
    await user.selectOptions(within(section).getByLabelText('Period'), within(section).getByRole('option', { name: 'September 2026' }));
    expect(await within(section).findByRole('img', { name: /review of September 2026: 1 entry over 1 day/i })).toBeInTheDocument();
  });

  it('saves a review as a PDF: a summary page and only that period, printed once', async () => {
    const user = userEvent.setup();
    const print = vi.fn(() => {
      expect(document.body).toHaveClass('printing-journal');
    });
    vi.stubGlobal('print', print);
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);
    const section = screen.getByRole('region', { name: /weekly & monthly review/i });

    await user.click(within(section).getByRole('button', { name: 'Save review as PDF' }));

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const area = document.querySelector('.print-area');
    expect(within(area).getByRole('heading', { level: 1 })).toHaveTextContent('My week, 12 Oct – 18 Oct 2026');
    expect(area).toHaveTextContent('Sunny start');
    expect(area).toHaveTextContent('Rainy low');
    expect(area).not.toHaveTextContent('Last week');
    expect(area).toHaveTextContent('Average mood');
    expect(document.querySelectorAll('.print-area')).toHaveLength(1);

    // After printing, the page goes back to the normal print preview.
    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(document.body).not.toHaveClass('printing-journal'));
    await waitFor(() => expect(within(document.querySelector('.print-area')).getByRole('heading', { level: 1 })).toHaveTextContent('My journal'));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('can save the same review as a PDF twice', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    await seedEntries(ENTRIES);
    await renderWithJournal(<ExportPage />);
    const section = screen.getByRole('region', { name: /weekly & monthly review/i });

    await user.click(within(section).getByRole('button', { name: 'Save review as PDF' }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('afterprint'));
    await user.click(within(section).getByRole('button', { name: 'Save review as PDF' }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
  });

  it('explains when there is nothing to review', async () => {
    await renderWithJournal(<ExportPage />);
    const section = screen.getByRole('region', { name: /weekly & monthly review/i });
    expect(within(section).getByText(/reviews will appear here/i)).toBeInTheDocument();
  });
});
