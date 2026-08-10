import { useEffect, useRef } from 'react';

// Traps Tab/Shift+Tab focus within the given ref while `active` is true, and
// focuses the first focusable element. Mirrors the vanilla-JS focusTrap helper.
export function useFocusTrap(active) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!active || !containerRef.current) return undefined;

    const container = containerRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = container.querySelectorAll(focusableSelector);
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    function handleKeyDown(e) {
      if (e.key !== 'Tab' || !first || !last) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', handleKeyDown);
    if (first) first.focus();

    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  return containerRef;
}
