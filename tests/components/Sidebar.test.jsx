import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Sidebar } from '../../src/components/Sidebar/Sidebar.jsx';

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
      <Routes>
        <Route path="*" element={<p data-testid="page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function nav() {
  return screen.getByRole('navigation', { name: /main navigation/i });
}

describe('Sidebar', () => {
  it('links to Home, Calendar, and Contact', () => {
    renderAt('/');

    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('href', '/calendar');
    expect(screen.getByRole('link', { name: /contact/i })).toHaveAttribute('href', '/contact');
  });

  it('hides the logo link from assistive tech so it is not a duplicate Home link', () => {
    renderAt('/');
    expect(nav().querySelectorAll('a')).toHaveLength(4);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('marks only Home as current on the dashboard', () => {
    renderAt('/');

    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /calendar/i })).not.toHaveAttribute('aria-current');
  });

  it('does not mark Home as current on other pages', () => {
    renderAt('/calendar');

    expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });

  it('updates the current link when you navigate', async () => {
    const user = userEvent.setup();
    renderAt('/');

    await user.click(screen.getByRole('link', { name: /contact/i }));

    expect(screen.getByRole('link', { name: /contact/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });
});
