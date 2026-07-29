// Shared dialog focus management (F-08 / WCAG 2.1.2, 2.4.3): move focus into a
// dialog when it opens, restore it to the trigger on close, and optionally trap
// Tab within the dialog. The custom back gesture / system-back already close
// overlays on touch (ADR-0035); this adds the keyboard + screen-reader half that
// mobile-first left out.
//
// **Escape is NOT here** (ADR-0103 §2, built 2026-08-01). It used to be, calling
// the dialog's `onClose` directly — a second close owner outside the back stack,
// which reached past any layer sitting above the dialog's own and dismissed the
// whole thing. It belongs to `useOverlay`'s `useEscapeAsBack`, which runs the
// resolver so the topmost layer decides. This hook is now what its name says.
//
// Focus lands on the dialog *container* (give it tabIndex={-1}), never the first
// field — auto-focusing an input would pop the on-screen keyboard the moment a
// bottom sheet opens on mobile. `initialFocusRef` is the opt-in exception
// (ADR-0101): a full-screen search mode WANTS the keyboard immediately, since
// entering it is itself the "type now" action — the one caller that passes it.
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  options: { trap?: boolean; initialFocusRef?: RefObject<HTMLElement | null> } = {},
) {
  const { trap = false, initialFocusRef } = options;

  useEffect(() => {
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (initialFocusRef?.current ?? node)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (!trap || e.key !== 'Tab' || !node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Restore focus to whatever opened the dialog, if it's still around.
      previouslyFocused?.focus?.();
    };
  }, [ref, trap, initialFocusRef]);
}
