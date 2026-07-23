/**
 * Subscribes to a CSS media query from JS.
 *
 * The board/single-column split is expressed in CSS, but the DnD wiring also
 * needs to know which mode it's in (column reordering only exists on the
 * board; the list tabs only exist below it), and that can't be done with a
 * media query alone.
 */
import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    setMatches(mediaQueryList.matches);

    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}
