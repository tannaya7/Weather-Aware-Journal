import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoodWeatherChart } from '../../src/components/MoodWeatherChart/MoodWeatherChart.jsx';

describe('MoodWeatherChart', () => {
  it('shows an empty state when no entry has both a mood and weather', () => {
    render(
      <MoodWeatherChart
        entries={[
          { id: 1, mood: 'Happy' },
          { id: 2, weatherType: 'Rain' },
        ]}
      />,
    );

    expect(screen.getByText(/once you've logged a few entries/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders one cell per weather/mood pair with its entry count', () => {
    render(
      <MoodWeatherChart
        entries={[
          { id: 1, mood: 'Happy', weatherType: 'Clear' },
          { id: 2, mood: 'Happy', weatherType: 'Clear' },
          { id: 3, mood: 'Sad', weatherType: 'Rain' },
        ]}
      />,
    );

    const grid = screen.getByRole('table', { name: /entry count by weather and mood/i });
    expect(within(grid).getAllByRole('cell')).toHaveLength(4);
    expect(within(grid).getByRole('cell', { name: 'Clear, Happy: 2 entries' })).toBeInTheDocument();
    expect(within(grid).getByRole('cell', { name: 'Rain, Sad: 1 entry' })).toBeInTheDocument();
    expect(within(grid).getByRole('cell', { name: 'Rain, Happy: 0 entries' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('asks for more entries while the sample is too small', () => {
    render(<MoodWeatherChart entries={[{ id: 1, mood: 'Sad', weatherType: 'Rain' }]} />);
    expect(screen.getByText(/add a few more entries/i)).toBeInTheDocument();
  });

  it('states the strongest mood/weather pattern in plain language', () => {
    render(
      <MoodWeatherChart
        entries={[
          { id: 1, mood: 'Sad', weatherType: 'Rain' },
          { id: 2, mood: 'Anxious', weatherType: 'Rain' },
          { id: 3, mood: 'Sad', weatherType: 'Rain' },
          { id: 4, mood: 'Happy', weatherType: 'Rain' },
        ]}
      />,
    );

    expect(
      screen.getByText('Your mood runs lower on rain days — 75% of those entries were a low mood.'),
    ).toBeInTheDocument();
  });

  it('lists only non-zero pairs in the table view', () => {
    render(
      <MoodWeatherChart
        entries={[
          { id: 1, mood: 'Happy', weatherType: 'Clear' },
          { id: 2, mood: 'Sad', weatherType: 'Rain' },
        ]}
      />,
    );

    const table = screen.getByText('View as table').closest('details').querySelector('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/Clear.*Happy.*1/);
    expect(rows[1]).toHaveTextContent(/Rain.*Sad.*1/);
  });
});
