// Unsaved-changes guard (U-05). Intercepts a form's close/back path so a dirty
// form asks before discarding. It owns only the decision + the prompt state; the
// caller renders the discard confirm (a tone="danger" ConfirmDialog) from
// `prompting` and wires `guardedClose` into the Modal's onClose (the overlay
// close path — backdrop, Escape, system-back) and the Cancel action.
//
// Kept render-free (a plain hook, not JSX) so it stays in lib/ and is unit-
// testable without mounting a dialog.
import { useCallback, useRef, useState } from 'react';

export interface UnsavedGuard {
  /** Wrap a close action: prompts when the form is dirty, else closes now. */
  guardedClose: (close: () => void) => void;
  /** True while the discard confirm should be shown. */
  prompting: boolean;
  /** Discard the edits and run the intercepted close. */
  confirmDiscard: () => void;
  /** Dismiss the confirm and keep editing. */
  cancelDiscard: () => void;
}

export function useUnsavedGuard(dirty: boolean): UnsavedGuard {
  const [prompting, setPrompting] = useState(false);
  const pendingClose = useRef<(() => void) | null>(null);

  const guardedClose = useCallback(
    (close: () => void) => {
      if (dirty) {
        pendingClose.current = close;
        setPrompting(true);
      } else {
        close();
      }
    },
    [dirty],
  );

  const confirmDiscard = useCallback(() => {
    setPrompting(false);
    const close = pendingClose.current;
    pendingClose.current = null;
    close?.();
  }, []);

  const cancelDiscard = useCallback(() => {
    pendingClose.current = null;
    setPrompting(false);
  }, []);

  return { guardedClose, prompting, confirmDiscard, cancelDiscard };
}
