import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../src/components/ErrorBoundary/ErrorBoundary.jsx';
import { readReports } from '../../src/lib/errorReport.js';

function Broken({ fail }) {
  if (fail) throw new Error('render failed on "Dear diary"');
  return <p>All good</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the page when nothing goes wrong', () => {
    render(
      <ErrorBoundary resetKey="/a">
        <Broken fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows a calm message instead of a blank page, and keeps a scrubbed report', () => {
    render(
      <ErrorBoundary resetKey="/a">
        <Broken fail />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/This page ran into a problem/);
    expect(screen.getByRole('alert')).toHaveTextContent(/Your journal is safe/);
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your journal' })).toHaveAttribute('href', '#/');
    const [report] = readReports();
    expect(report).toMatchObject({ kind: 'page-crash', message: 'render failed on …' });
  });

  it('gives the next page a fresh start', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Broken fail />
      </ErrorBoundary>,
    );
    rerender(
      <ErrorBoundary resetKey="/b">
        <Broken fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});
