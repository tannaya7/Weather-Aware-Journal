import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDraftAutosave } from '../../src/hooks/useDraftAutosave.js';

const BASE = { content: '' };

function setup(initial = BASE) {
  const onSave = vi.fn();
  const hook = renderHook(({ values }) => useDraftAutosave(values, BASE, onSave, 800), {
    initialProps: { values: initial },
  });
  return { onSave, ...hook };
}

describe('useDraftAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('does not save anything until the values change', () => {
    const { onSave } = setup();
    vi.advanceTimersByTime(5000);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves once, shortly after typing stops', () => {
    const { onSave, rerender } = setup();

    rerender({ values: { content: 'H' } });
    vi.advanceTimersByTime(500);
    rerender({ values: { content: 'Hi' } });
    vi.advanceTimersByTime(500);
    expect(onSave).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ content: 'Hi' });
  });

  it('saves null when the values go back to the baseline', () => {
    const { onSave, rerender } = setup();
    rerender({ values: { content: 'oops' } });
    rerender({ values: { content: '' } });
    vi.advanceTimersByTime(800);
    expect(onSave).toHaveBeenLastCalledWith(null);
  });

  it('saves right away when the tab is hidden', () => {
    const { onSave, rerender } = setup();
    rerender({ values: { content: 'Leaving soon' } });

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onSave).toHaveBeenCalledWith({ content: 'Leaving soon' });
  });

  it('saves right away when the form closes', () => {
    const { onSave, rerender, unmount } = setup();
    rerender({ values: { content: 'Navigating away' } });
    unmount();
    expect(onSave).toHaveBeenCalledWith({ content: 'Navigating away' });
  });

  it('stops saving once the entry is saved for real', () => {
    const { onSave, rerender, result, unmount } = setup();
    rerender({ values: { content: 'Submitted' } });
    act(() => result.current.stop());
    vi.advanceTimersByTime(2000);
    unmount();
    expect(onSave).not.toHaveBeenCalled();
  });
});
