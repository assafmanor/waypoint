// The single overlay primitive (ADR-0079). Every sheet/dialog in the app is a
// Modal: one place carries the overlay-stack registration (so back — system-
// back, a shell back button — closes it first, ADR-0035/0090) and the focus
// contract (focus-in + Escape + focus-restore, optional Tab-trap, F-08). Three
// variants — a bottom `sheet`, a centered `dialog`, and a full-viewport `full`
// (ADR-0101) — share all that machinery; only shape and position differ
// (modal.css). `Sheet` is a thin wrapper over `variant="sheet"`; the
// `.confirm-*`/`.event-form-*` families fold on in Wave 2.
import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '../../state/nav-state';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { useExitTransition } from '../../lib/useExitTransition';
import './modal.css';

export type ModalVariant = 'sheet' | 'dialog' | 'full';

export function Modal({
  variant,
  title,
  ariaLabel,
  labelledBy,
  onClose,
  trap,
  initialFocusRef,
  children,
}: {
  variant: ModalVariant;
  /** Optional visible heading; when set it also labels the dialog (aria-labelledby),
   *  so a node heading (e.g. a `TitleLabel` route) still names the dialog by its
   *  rendered text. */
  title?: ReactNode;
  /** Accessible name when there is no visible title (e.g. a grip-only sheet). */
  ariaLabel?: string;
  /** Point the dialog at an existing element's id instead of rendering a title. */
  labelledBy?: string;
  onClose: () => void;
  /** Tab-trap override. Defaults to variant-driven (see below). */
  trap?: boolean;
  /** Focus this element on mount instead of the dialog container — the one
   *  case being a `'full'` search mode, where popping the keyboard immediately
   *  is the point (see `useDialogFocus`). Omit for the default container focus. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Children, or a function receiving the overlay's own **animated** close.
   *
   *  An in-card `✕` / `ביטול` that calls the caller's `onClose` directly bypasses
   *  the exit and snaps — and that control is the most-used way out of a sheet, so
   *  leaving it un-animated would make ADR-0140 half-true. Take the function form
   *  and bind that control to the `close` it hands you, which is the same path the
   *  backdrop, a back and Escape all take. (A function rather than a context so no
   *  call site has to extract an inner component just to read one.) */
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  // ── The exit (ADR-0140 §1, mechanism extracted to `useExitTransition` in ADR-0144) ──
  // `onClose` is ALREADY the one owner of leaving: the backdrop calls it, the overlay
  // stack calls it on a back, and since #365 Escape is a back trigger that resolves
  // through that same stack. So the exit is hung on that one path by wrapping it — this
  // adds no second close route, which is the thing #365 removed and ADR-0103 §2 forbids
  // re-creating. The wrapper plays the exit, THEN tells the caller; the caller unmounts
  // us on `onClose`, which is precisely why calling it first meant nothing animated out.
  const { closing, beginClose } = useExitTransition(onClose);

  // Register as the topmost overlay so a back trigger closes this before
  // touching structural navigation (ADR-0035 §4). The layer is peeled the moment
  // back fires — only the pixels linger — so a back is never delayed or swallowed
  // by the animation, and a second back during the exit reaches what is behind.
  useOverlay(beginClose);
  const cardRef = useRef<HTMLDivElement>(null);
  // Trap default is variant-driven, and deliberately opposite per variant:
  //  - `dialog` traps: a centered dialog is a focus dead-end by design (a
  //    confirm/alert owning its own buttons — nothing legitimately sits behind
  //    it), so Tab should wrap inside it.
  //  - `sheet` does NOT trap: some sheets open a nested body-portalled prompt
  //    (e.g. the booking delete/unlink alertdialog), which a trap on this card
  //    would lock out — this preserved the pre-primitive Sheet behavior.
  //  - `full` does NOT trap either: it's a self-contained screen, not a modal
  //    dead-end, so Tab behaves like ordinary page content.
  const trapEnabled = trap ?? variant === 'dialog';
  useDialogFocus(cardRef, { trap: trapEnabled, initialFocusRef });

  const titleId = useId();
  const hasTitle = title != null && title !== '';
  const labelId = labelledBy ?? (hasTitle ? titleId : undefined);

  // Portal to document.body so the fixed overlay escapes any ancestor stacking
  // context — a caller carrying `opacity < 1` (e.g. a done/passed day-view row)
  // would otherwise trap the overlay inside the card and let later siblings
  // paint over it.
  // `full` has nothing "outside" it to tap-dismiss to — it exits only via its
  // own explicit back control, so the backdrop click is disabled for it.
  return createPortal(
    <div
      className={closing ? 'modal-overlay is-closing' : 'modal-overlay'}
      data-variant={variant}
      onClick={variant === 'full' ? undefined : beginClose}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={labelId ? undefined : ariaLabel}
        aria-labelledby={labelId}
        onClick={(e) => e.stopPropagation()}
      >
        {hasTitle && (
          <div className="modal-title" id={titleId}>
            {title}
          </div>
        )}
        {typeof children === 'function' ? children(beginClose) : children}
      </div>
    </div>,
    document.body,
  );
}
