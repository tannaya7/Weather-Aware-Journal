import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StreakCard } from '../../src/components/StreakCard/StreakCard.jsx';

const TODAY = new Date(2026, 9, 5, 9, 0);

function on(day) {
  return { id: day, date: new Date(2026, 9, day, 20).toISOString() };
}

describe('StreakCard', () => {
  it('renders nothing before the first entry', () => {
    const { container } = render(<StreakCard entries={[]} today={TODAY} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the current and longest streak', () => {
    render(<StreakCard entries={[on(4), on(5)]} today={TODAY} />);

    const card = screen.getByRole('region', { name: 'Writing streak' });
    expect(card).toHaveTextContent('2-day streak');
    expect(card).toHaveTextContent('Longest: 2 days');
    expect(card).not.toHaveTextContent('keep it going');
  });

  it('nudges you to write when today is still open', () => {
    render(<StreakCard entries={[on(4)]} today={TODAY} />);

    expect(screen.getByText('1-day streak')).toBeInTheDocument();
    expect(screen.getByText(/longest: 1 day · write today to keep it going/i)).toBeInTheDocument();
  });

  it('invites a fresh start after the streak breaks', () => {
    render(<StreakCard entries={[on(1), on(2)]} today={TODAY} />);

    expect(screen.getByText('No streak right now')).toBeInTheDocument();
    expect(screen.getByText(/longest: 2 days · write today to start a new one/i)).toBeInTheDocument();
  });
});
