import { createContext, useCallback, useContext, useRef } from 'react';

const AnnouncerContext = createContext(null);

// Provides screen-reader announcements via two persistent ARIA live regions
// (polite + assertive), mirroring the previous vanilla a11y.js behavior.
export function AnnouncerProvider({ children }) {
  const politeRef = useRef(null);
  const assertiveRef = useRef(null);

  const announce = useCallback((message, priority = 'polite') => {
    const region = priority === 'assertive' ? assertiveRef.current : politeRef.current;
    if (!region) return;

    region.textContent = '';
    const setTimer = setTimeout(() => {
      region.textContent = message;
    }, 100);
    const clearTimer = setTimeout(() => {
      region.textContent = '';
    }, 5000);

    return () => {
      clearTimeout(setTimer);
      clearTimeout(clearTimer);
    };
  }, []);

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      <div ref={politeRef} className="sr-only" aria-live="polite" aria-atomic="true" />
      <div ref={assertiveRef} className="sr-only" aria-live="assertive" aria-atomic="true" />
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer() {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) throw new Error('useAnnouncer must be used within an AnnouncerProvider');
  return ctx;
}
