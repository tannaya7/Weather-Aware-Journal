import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
  options: null,
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options) => {
    sw.options = options;
    return {
      needRefresh: [sw.needRefresh, sw.setNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: sw.updateServiceWorker,
    };
  },
}));

const { UpdatePrompt } = await import('../../src/components/UpdatePrompt/UpdatePrompt.jsx');

describe('UpdatePrompt', () => {
  beforeEach(() => {
    sw.needRefresh = false;
    sw.setNeedRefresh.mockClear();
    sw.updateServiceWorker.mockClear();
  });

  it('shows nothing while the app is up to date', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a refresh when a new version is waiting', async () => {
    const user = userEvent.setup();
    sw.needRefresh = true;
    render(<UpdatePrompt />);

    expect(screen.getByRole('status')).toHaveTextContent('A new version of Weather Journal is available.');

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('can be dismissed until next time', async () => {
    const user = userEvent.setup();
    sw.needRefresh = true;
    render(<UpdatePrompt />);

    await user.click(screen.getByRole('button', { name: 'Dismiss update notification' }));

    expect(sw.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();
  });

  it('checks for new versions every hour while the app is open', () => {
    vi.useFakeTimers();
    render(<UpdatePrompt />);
    const registration = { update: vi.fn() };

    sw.options.onRegisteredSW('sw.js', registration);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('copes with no registration (e.g. browsers without service workers)', () => {
    render(<UpdatePrompt />);
    expect(() => sw.options.onRegisteredSW('sw.js', undefined)).not.toThrow();
  });
});
