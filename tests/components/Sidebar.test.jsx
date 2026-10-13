import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Sidebar } from '../../src/components/Sidebar/Sidebar.jsx';
import { renderWithJournal } from '../helpers/journal.jsx';

function renderAt(path) {
  return renderWithJournal(
    <>
      <Sidebar />
      <Routes>
        <Route path="*" element={<p data-testid="page" />} />
      </Routes>
    </>,
    { initialEntries: [path] },
  );
}

function nav() {
  return screen.getByRole('navigation', { name: /main navigation/i });
}

describe('Sidebar', () => {
  it('links to Home, Calendar, Contact, and Settings', async () => {
    await renderAt('/');

    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('href', '/calendar');
    expect(screen.getByRole('link', { name: /contact/i })).toHaveAttribute('href', '/contact');
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('has no Lock button when no passcode is set', async () => {
    await renderAt('/');
    expect(screen.queryByRole('button', { name: 'Lock' })).not.toBeInTheDocument();
  });

  it('hides the logo link from assistive tech so it is not a duplicate Home link', async () => {
    await renderAt('/');
    expect(nav().querySelectorAll('a')).toHaveLength(5);
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('marks only Home as current on the dashboard', async () => {
    await renderAt('/');

    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /calendar/i })).not.toHaveAttribute('aria-current');
  });

  it('does not mark Home as current on other pages', async () => {
    await renderAt('/calendar');

    expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });

  it('updates the current link when you navigate', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    await user.click(screen.getByRole('link', { name: /contact/i }));

    expect(screen.getByRole('link', { name: /contact/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });
});
