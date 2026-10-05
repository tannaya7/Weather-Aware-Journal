import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryForm } from '../../src/components/EntryForm/EntryForm.jsx';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';

// A stand-in for the browser's SpeechRecognition that the test drives.
class FakeRecognition {
  static last = null;

  constructor() {
    FakeRecognition.last = this;
    this.start = vi.fn();
    this.stop = vi.fn(() => this.onend?.());
    this.abort = vi.fn();
  }

  speak(text, isFinal) {
    const result = [{ transcript: text }];
    result.isFinal = isFinal;
    this.onresult({ resultIndex: 0, results: [result] });
  }
}

function renderForm() {
  render(
    <AnnouncerProvider>
      <EntryForm mode="create" onSubmit={() => true} />
    </AnnouncerProvider>,
  );
  return screen.getByLabelText(/what's on your mind/i);
}

describe('Dictation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeRecognition.last = null;
  });

  it('is hidden in browsers without speech recognition', () => {
    renderForm();
    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument();
  });

  it('says where speech is processed before you start', () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    renderForm();
    expect(screen.getByText(/online speech service/i)).toBeInTheDocument();
  });

  it('types what you say into the entry', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const textarea = renderForm();

    await user.click(screen.getByRole('button', { name: /dictate/i }));
    const recognition = FakeRecognition.last;
    expect(recognition.start).toHaveBeenCalled();
    expect(recognition.continuous).toBe(true);
    expect(screen.getByRole('button', { name: /stop dictating/i })).toHaveAttribute('aria-pressed', 'true');

    act(() => recognition.speak('it rained all', false));
    expect(screen.getByRole('status')).toHaveTextContent('Listening… it rained all');
    expect(textarea).toHaveValue('');

    act(() => recognition.speak('It rained all day', true));
    expect(textarea).toHaveValue('It rained all day');

    act(() => recognition.speak('and I stayed in', true));
    expect(textarea).toHaveValue('It rained all day and I stayed in');

    await user.click(screen.getByRole('button', { name: /stop dictating/i }));
    expect(recognition.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /dictate/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds to what you typed, and continues on a new line under a prompt', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const textarea = renderForm();

    await user.type(textarea, 'Typed first.  ');
    await user.click(screen.getByRole('button', { name: /dictate/i }));
    act(() => FakeRecognition.last.speak('Then spoke.', true));
    expect(textarea).toHaveValue('Typed first. Then spoke.');

    await user.clear(textarea);
    await user.type(textarea, 'A prompt?{enter}{enter}');
    act(() => FakeRecognition.last.speak('My answer', true));
    expect(textarea).toHaveValue('A prompt?\n\nMy answer');
  });

  it('explains a blocked microphone', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    renderForm();

    await user.click(screen.getByRole('button', { name: /dictate/i }));
    act(() => {
      FakeRecognition.last.onerror({ error: 'not-allowed' });
      FakeRecognition.last.onend();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/microphone access is blocked/i);
  });

  it('stops listening when the form closes', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const { unmount } = render(
      <AnnouncerProvider>
        <EntryForm mode="create" onSubmit={() => true} />
      </AnnouncerProvider>,
    );
    await user.click(screen.getByRole('button', { name: /dictate/i }));
    const recognition = FakeRecognition.last;

    unmount();

    expect(recognition.abort).toHaveBeenCalled();
  });
});
