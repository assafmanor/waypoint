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

export function wrapNav(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <NavProvider>{node}</NavProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}
