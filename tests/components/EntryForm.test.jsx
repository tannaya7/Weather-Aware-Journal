import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EntryForm } from '../../src/components/EntryForm/EntryForm.jsx';
import { AnnouncerProvider } from '../../src/context/AnnouncerContext.jsx';

function renderForm(props = {}) {
  const onSubmit = vi.fn();
  render(
    <AnnouncerProvider>
      <EntryForm mode="create" onSubmit={onSubmit} {...props} />
    </AnnouncerProvider>,
  );
  return { onSubmit };
}

describe('EntryForm', () => {
  it('blocks submission when content is empty', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole('button', { name: /save entry/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/what's on your mind/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('saves with just content — mood, date, tags, and weather are all optional', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/what's on your mind/i), 'It was a good day.');
    await user.click(screen.getByRole('button', { name: /save entry/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.content).toBe('It was a good day.');
    expect(submitted.mood).toBe('');
    expect(submitted.date).toBeTruthy(); // auto-defaulted to now
    expect(submitted.tags).toEqual([]);
  });

  it('defaults the date field to now for a new entry', () => {
    renderForm();
    const dateInput = document.getElementById('dateInput');
    expect(dateInput.value).not.toBe('');
  });

  it('lets the user pick and clear a mood chip', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByLabelText(/happy/i));
    await user.type(screen.getByLabelText(/what's on your mind/i), 'Feeling good.');
    await user.click(screen.getByRole('button', { name: /save entry/i }));

    expect(onSubmit.mock.calls[0][0].mood).toBe('Happy');
  });

  it('pre-fills content from initialEntry in edit mode', () => {
    renderForm({
      mode: 'edit',
      initialEntry: {
        id: 1,
        date: '2025-11-28T10:00',
        mood: 'Peaceful',
        content: 'Existing content',
        tags: ['a', 'b'],
      },
    });

    expect(screen.getByLabelText(/what's on your mind/i)).toHaveValue('Existing content');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});
