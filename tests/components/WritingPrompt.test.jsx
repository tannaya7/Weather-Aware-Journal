import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WritingPrompt } from '../../src/components/WritingPrompt/WritingPrompt.jsx';
import { EntryForm } from '../../src/components/EntryForm/EntryForm.jsx';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';
import { getPrompt } from '../../src/lib/prompts.js';

const TODAY = new Date(2026, 9, 5, 9, 0);

function promptButton() {
  return screen.getByRole('button', { name: /start writing from this prompt/i });
}

describe('WritingPrompt', () => {
  it("shows today's prompt and hands it over when tapped", async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<WritingPrompt onUse={onUse} today={TODAY} />);

    const expected = getPrompt(TODAY, undefined, 0);
    expect(screen.getByText(expected)).toBeInTheDocument();

    await user.click(promptButton());

    expect(onUse).toHaveBeenCalledWith(expected);
    expect(screen.queryByRole('button', { name: /start writing/i })).not.toBeInTheDocument();
  });

  it('shows a different prompt when shuffled', async () => {
    const user = userEvent.setup();
    render(<WritingPrompt onUse={() => {}} today={TODAY} />);

    await user.click(screen.getByRole('button', { name: /show a different prompt/i }));

    expect(screen.getByText(getPrompt(TODAY, undefined, 1))).toBeInTheDocument();
  });

  it('uses a weather prompt when the weather is known', () => {
    render(<WritingPrompt weatherType="Snow" onUse={() => {}} today={TODAY} />);
    expect(screen.getByText(getPrompt(TODAY, 'Snow', 0))).toBeInTheDocument();
  });
});

describe('EntryForm with a prompt', () => {
  function renderForm(props) {
    render(
      <AnnouncerProvider>
        <EntryForm onSubmit={() => {}} {...props} />
      </AnnouncerProvider>,
    );
  }

  it('puts the prompt at the top of the entry', async () => {
    const user = userEvent.setup();
    renderForm({ mode: 'create' });

    const textarea = screen.getByLabelText(/what's on your mind/i);
    await user.type(textarea, 'Already started.');
    const prompt = promptButton().getAttribute('aria-label').replace('Start writing from this prompt: ', '');
    await user.click(promptButton());

    expect(textarea).toHaveValue(`${prompt}\n\nAlready started.`);
    expect(textarea).toHaveFocus();
  });

  it('does not show a prompt when editing an entry', () => {
    renderForm({ mode: 'edit', initialEntry: { id: 1, content: 'Old', date: '2026-01-01T10:00' } });
    expect(screen.queryByRole('button', { name: /start writing/i })).not.toBeInTheDocument();
  });
});
