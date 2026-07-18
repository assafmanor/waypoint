// Shared dialog focus management (F-08 / WCAG 2.1.2, 2.4.3): move focus into a
// dialog when it opens, restore it to the trigger on close, close on Escape, and
// optionally trap Tab within the dialog. The custom back gesture / system-back
// already close overlays on touch (ADR-0035); this adds the keyboard + screen-
// reader half that mobile-first left out.
//
// Focus lands on the dialog *container* (give it tabIndex={-1}), never the first
// field — auto-focusing an input would pop the on-screen keyboard the moment a
// bottom sheet opens on mobile.
import { useEffect, useRef, type RefObject } from 'react';

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
  onClose: () => void,
  options: { trap?: boolean } = {},
) {
  const { trap = false } = options;
  // Latest-ref so a re-created onClose doesn't re-run the effect (which would
  // re-focus the container mid-interaction).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    node?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
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
  }, [ref, trap]);
}
