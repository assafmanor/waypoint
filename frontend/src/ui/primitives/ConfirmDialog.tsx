// One variant-driven confirm dialog (U-02). Renders on the single Modal
// primitive (variant="dialog" → centered, Tab-trapped, overlay-stack + focus),
// so back/Escape/backdrop and focus-in/restore come for free. Replaces the three
// bespoke centered-dialog families: the hard-edit gate (ConfirmProvider), the
// BookingSheet DeletePrompt, and the TripSettings inline Confirm.
//
// `tone` colors only the confirm button (and a subtle heading accent) — the card
// chrome stays neutral (ADR-0079): amber for the hard-edit commitment guard,
// --miss for danger, neutral --cta otherwise. Buttons follow the canonical
// order (confirm first, then cancel) shared with FormActions.
import { type ReactNode } from 'react';
import { Modal } from './Modal';
import { t } from '../../i18n/he';
import './confirm-dialog.css';

export type ConfirmTone = 'neutral' | 'danger' | 'hard';

export function ConfirmDialog({
  tone,
  title,
  body,
  icon,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  children,
}: {
  tone: ConfirmTone;
  title: string;
  body?: ReactNode;
  /** Leading glyph on the heading (e.g. the lock for the hard-edit guard). */
  icon?: ReactNode;
  /** When set, renders the standard confirm/cancel action row. Omit for a
   *  custom action body passed via `children` (e.g. the delete/unlink choices). */
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal variant="dialog" ariaLabel={title} onClose={onCancel}>
      <div className="confirm" data-tone={tone}>
        <div className="confirm-heading">
          {icon != null && <span aria-hidden="true">{icon}</span>}
          {title}
        </div>
        {body != null && <p className="confirm-text">{body}</p>}
        {children}
        {confirmLabel != null && (
          <div className="confirm-actions">
            <button type="button" className="confirm-confirm" onClick={onConfirm}>
              {confirmLabel}
            </button>
            <button type="button" className="confirm-cancel" onClick={onCancel}>
              {cancelLabel ?? t.common.cancel}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
