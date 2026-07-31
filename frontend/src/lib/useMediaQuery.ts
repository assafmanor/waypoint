// A media query as React state, for the rare decision CSS cannot make on its own.
//
// Almost everything responsive in this app is a `@media` rule, and should stay
// one. This exists for the case where the ANSWER is not a style: the header's
// people stack draws one fewer circle on a narrow phone (ADR-0149 §4), and
// hiding the extra avatar in CSS would leave the `+N` bubble counting a member
// that is still rendered — a count that lies. So the count is decided here and
// the markup follows.
import { useEffect, useState } from 'react';
import { NARROW_MAX_PX } from '../constants';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [active, setActive] = useState(() => matches(query));
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    setActive(mql.matches);
    const onChange = () => setActive(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return active;
}

const NARROW_QUERY = `(max-width: ${NARROW_MAX_PX}px)`;

/** The narrow-phone step the header's tightest row reads. Mirrors App.css's
 *  `@media (max-width: 370px)` rules off the one named constant. */
export function useNarrowScreen(): boolean {
  return useMediaQuery(NARROW_QUERY);
}
