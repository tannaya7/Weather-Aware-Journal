import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EntryCard } from '../../src/components/EntryCard/EntryCard.jsx';

function renderCard(entry) {
  return render(
    <MemoryRouter>
      <ul>
        <EntryCard
          entry={{ id: 1, date: '2026-10-11T12:00', ...entry }}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </ul>
    </MemoryRouter>,
  );
}

describe('EntryCard', () => {
  it('previews the writing under the title, skipping blank lines between them', () => {
    renderCard({ content: 'Sunny run by the lake\n\n  \nLegs heavy, head clear.' });
    const preview = screen
      .getByRole('link', { name: 'Read entry: Sunny run by the lake' })
      .querySelector('p');
    expect(preview.textContent).toBe('Sunny run by the lake\nLegs heavy, head clear.');
  });
});
