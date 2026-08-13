// **The provider stack a component needs once it joins the back stack.**
//
// `useOverlay`/`useBackLayer` reach for `NavProvider`, which itself needs a router (it
// navigates) and the toast (it announces the leave-trip confirm). So any component that
// registers a layer — which after session 176 includes leaf primitives like `TimeField` and
// `IconPicker`, not just sheets — cannot be rendered bare in a test.
//
// Extracted rather than copied a twelfth time (rule 8): the same three-provider `wrap` was
// already open-coded in eleven `*.test.tsx` files. Those keep their local copies until they
// are next touched; new tests use this one.
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../ui/Toast';
import { NavProvider } from '../state/nav-state';
import { ModeProvider } from '../state/mode-state';

/** `path` for the surfaces whose behaviour depends on WHERE you are — the shared header's
 *  day strip singles out a day only on a tab that is showing one (`tabShowsSelectedDay`),
 *  which cannot be asserted from the default `/`. Defaults to Home, as before.
 *
 *  `mode` adds `ModeProvider`, which anything reaching for `useMode()` needs — a
 *  `SearchOverlay` host is the common case, since the overlay wears the mode's chrome tint
 *  (ADR-0101). **Opt-in, not default**, and for a reason: `ModeProvider` itself calls
 *  `useTrip()`, so it can only be mounted by a test that has a trip (real provider or
 *  mocked module). `IndexNotesView.test.tsx` open-codes this same four-provider stack and
 *  moves onto this flag when it is next touched. */
export function wrapNav(
  node: ReactNode,
  { path = '/', mode = false }: { path?: string; mode?: boolean } = {},
) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <NavProvider>{mode ? <ModeProvider>{node}</ModeProvider> : node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}
