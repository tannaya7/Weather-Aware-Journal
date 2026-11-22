import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// The AI Tools page links to a spot on another page by passing the element's
// id as `state.focus`. Once that element exists (some pages load their parts
// a moment late), scroll to it and move keyboard focus there. Gives up after
// about two seconds. Does nothing when the page was opened any other way.
export function useFocusTarget() {
  const focus = useLocation().state?.focus;
  useEffect(() => {
    if (typeof focus !== 'string') return undefined;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const element = document.getElementById(focus);
      if (element) {
        clearInterval(timer);
        element.scrollIntoView?.({ block: 'start' });
        element.focus({ preventScroll: true });
      } else if (tries >= 20) {
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [focus]);
}
