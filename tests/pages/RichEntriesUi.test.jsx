import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryFormPage } from '../../src/pages/EntryFormPage.jsx';
import { EntryDetail } from '../../src/pages/EntryDetail.jsx';
import { Dashboard } from '../../src/pages/Dashboard.jsx';
import { loadEntries } from '../../src/lib/storage.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function renderAt(path) {
  return renderWithJournal(
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/new" element={<EntryFormPage />} />
      <Route path="/entry/:id" element={<EntryDetail />} />
    </Routes>,
    { initialEntries: [path] },
  );
}

describe('Formatting and templates', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('bolds the selected text and adds a checklist', async () => {
    const user = userEvent.setup();
    await renderAt('/new');
    const textarea = await screen.findByLabelText(/what's on your mind/i);

    await user.type(textarea, 'Big day');
    textarea.setSelectionRange(4, 7);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(textarea).toHaveValue('Big **day**');

    await user.type(textarea, '{End}{Enter}buy milk');
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await user.click(screen.getByRole('button', { name: 'Checklist' }));
    expect(textarea).toHaveValue('Big **day**\n- [ ] buy milk');
  });

  it('starts an entry from a template', async () => {
    const user = userEvent.setup();
    await renderAt('/new');
    const textarea = await screen.findByLabelText(/what's on your mind/i);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Use a template' }), 'gratitude');

    expect(textarea.value).toMatch(/^# Three things I’m grateful for\n1\. /);
  });

  it('shows formatting on the entry page, and ticks checklist items', async () => {
    const user = userEvent.setup();
    await seedEntries([
      { id: 1, content: '# Plans\nA **bold** move\n- [ ] book tickets\n- [x] pack', date: '2026-10-01T10:00' },
    ]);
    await renderAt('/entry/1');

    expect(screen.getByRole('heading', { level: 1, name: 'Plans' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    const box = screen.getByRole('checkbox', { name: 'book tickets' });
    expect(box).not.toBeChecked();

    await user.click(box);

    await waitFor(async () =>
      expect((await loadEntries())[0].content).toBe('# Plans\nA **bold** move\n- [x] book tickets\n- [x] pack'),
    );
    expect(screen.getByRole('checkbox', { name: 'book tickets' })).toBeChecked();
  });

  it('never renders entry text as HTML', async () => {
    await seedEntries([{ id: 1, content: 'Hi <img src=x onerror="alert(1)"> **<b>bold</b>**', date: '2026-10-01T10:00' }]);
    await renderAt('/entry/1');

    const article = screen.getByRole('article');
    expect(article.querySelector('img')).toBeNull();
    expect(article.querySelector('b')).toBeNull();
    expect(article).toHaveTextContent('<img src=x onerror="alert(1)">');
  });
});

describe('Smarter search', () => {
  beforeEach(async () => {
    localStorage.clear();
    await seedEntries([
      { id: 1, content: 'Rainy walk in the park', mood: 'Peaceful', weatherType: 'Rain', tags: ['walks'], date: '2025-03-10T10:00' },
      { id: 2, content: 'Rainy day at work', mood: 'Anxious', weatherType: 'Rain', tags: ['work'], date: '2025-07-01T10:00' },
      { id: 3, content: 'Long walk by the river', mood: 'Peaceful', tags: ['walks'], date: '2025-08-01T10:00' },
    ]);
  });

  it('understands operators and highlights matches', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    await user.type(screen.getByRole('textbox', { name: 'Search journal entries' }), 'rainy mood:peaceful');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 entry'));
    const marks = [...document.querySelectorAll('mark')].map((m) => m.textContent.toLowerCase());
    expect(marks).toContain('rainy');
  });

  it('shows related entries on the entry page', async () => {
    await renderAt('/entry/1');

    const related = screen.getByRole('region', { name: 'Related entries' });
    // Shared tag + word + mood beats a shared word + weather.
    expect(within(related).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Long walk by the river',
      'Rainy day at work',
    ]);
  });
});

describe('Voice memos', () => {
  let lastRecorder;

  // A stand-in for the browser's MediaRecorder and microphone.
  class FakeRecorder {
    static isTypeSupported = (t) => t === 'audio/webm;codecs=opus';

    constructor(stream, options) {
      lastRecorder = this;
      this.stream = stream;
      this.mimeType = options?.mimeType;
      this.state = 'inactive';
    }

    start() {
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) });
      this.onstop?.();
    }
  }

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('records a memo, plays it back, and saves it with the entry', async () => {
    const user = userEvent.setup();
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await renderAt('/new');

    await user.type(await screen.findByLabelText(/what's on your mind/i), 'Said it out loud');
    await user.click(screen.getByRole('button', { name: /record a voice memo/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Recording 0:00');

    now.mockReturnValue(1_000_000 + 12_000);
    await act(async () => lastRecorder.stop());

    expect(await screen.findByLabelText('Voice memo 1')).toBeInTheDocument();
    expect(screen.getByText('0:12')).toBeInTheDocument();
    now.mockRestore();

    await user.click(screen.getByRole('button', { name: /save entry/i }));
    await waitFor(async () => {
      const [entry] = await loadEntries();
      expect(entry.audio).toHaveLength(1);
      expect(entry.audio[0]).toMatchObject({ duration: 12, mimeType: 'audio/webm;codecs=opus' });
      expect(entry.audio[0].src).toMatch(/^data:audio\/webm/);
    });
  });

  it('explains a blocked microphone', async () => {
    const user = userEvent.setup();
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    await renderAt('/new');

    await user.click(await screen.findByRole('button', { name: /record a voice memo/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/microphone access is blocked/i);
  });
});
