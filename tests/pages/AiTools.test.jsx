import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiTools } from '../../src/pages/AiTools.jsx';
import { Insights } from '../../src/pages/Insights.jsx';
import { Sidebar } from '../../src/components/Sidebar/Sidebar.jsx';
import { setServerUrl } from '../../src/lib/syncClient.js';
import { renderWithJournal, seedEntries } from '../helpers/journal.jsx';

function renderAt(path, { language = 'en' } = {}) {
  return renderWithJournal(
    <>
      <Sidebar />
      <Routes>
        <Route path="/ai" element={<AiTools />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="*" element={<p data-testid="elsewhere" />} />
      </Routes>
    </>,
    { initialEntries: [path], language },
  );
}

afterEach(() => {
  setServerUrl('');
  vi.unstubAllGlobals();
});

describe('AI Tools hub', () => {
  it('is reachable from the main navigation and shows where each tool lives', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    await user.click(screen.getByRole('link', { name: 'AI Tools' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'AI Tools' })).toBeInTheDocument();
    const names = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent.replace(/^\S+\s/, '').trim());
    expect(names).toEqual(['Organize an entry', 'Plan my day', 'Writing prompt', 'Review a period']);
  });

  it('marks the AI Tools link as the current page', async () => {
    await renderAt('/ai');
    expect(screen.getByRole('link', { name: 'AI Tools' })).toHaveAttribute('aria-current', 'page');
  });

  it('says plainly that this copy has no server, and sends nothing', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await renderAt('/ai');

    expect(await screen.findByRole('status')).toHaveTextContent(/isn’t connected to a server/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks for sync when a server is set but sync is off', async () => {
    setServerUrl('https://server.example.test');
    await renderAt('/ai');

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Turn on sync in Settings/);
    expect(within(status).getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
  });

  it('opens the latest entry for organizing, or the writing page when there are none', async () => {
    await renderAt('/ai');
    expect(screen.getByRole('link', { name: 'Write an entry first' })).toHaveAttribute('href', '/new');
  });

  it('links the latest entry, the home forecast, the writing page and Insights', async () => {
    await seedEntries([
      { id: 1, content: 'Older', date: '2026-10-01T10:00' },
      { id: 2, content: 'Newer', date: '2026-10-05T10:00' },
    ]);
    await renderAt('/ai');

    expect(screen.getByRole('link', { name: 'Open your latest entry' })).toHaveAttribute('href', '/entry/2');
    expect(screen.getByRole('link', { name: 'Open Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Start a new entry' })).toHaveAttribute('href', '/new');
    expect(screen.getByRole('link', { name: 'Open Insights' })).toHaveAttribute('href', '/insights');
  });

  it('takes you to the right spot on the destination page and focuses it', async () => {
    const user = userEvent.setup();
    await seedEntries([{ id: 1, content: 'One', date: '2026-10-05T10:00' }]);
    await renderAt('/ai');

    await user.click(screen.getByRole('link', { name: 'Open Insights' }));

    const heading = await screen.findByRole('heading', { name: 'Review a period' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('is available in Spanish and Hindi', async () => {
    const spanish = await renderAt('/ai', { language: 'es' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Herramientas de IA' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir Tendencias' })).toBeInTheDocument();
    spanish.unmount();

    await renderAt('/ai', { language: 'hi' });
    expect(await screen.findByRole('heading', { level: 1, name: 'AI टूल्स' })).toBeInTheDocument();
  });
});
