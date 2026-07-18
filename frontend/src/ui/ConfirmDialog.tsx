// Hard-event edit confirmation gate (T-030 / ADR-0011). A single app-level
// dialog, reached via useConfirmHardEdit() from any screen/verb — so a second
// trigger (e.g. a swipe gesture) opens the same dialog instead of a duplicate.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { TripEvent } from '@waypoint/shared';
import { ICONS } from '../constants';
import { useOverlay } from '../state/nav-state';
import { useDialogFocus } from '../lib/useDialogFocus';
import { t } from '../i18n/he';

export type ConfirmHardEditAction = 'edit' | 'delete';
type ConfirmHardEdit = (event: TripEvent, action?: ConfirmHardEditAction) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmHardEdit | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    event: TripEvent;
    action: ConfirmHardEditAction;
  } | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirmHardEdit = useCallback<ConfirmHardEdit>(
    (event, action = 'edit') =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setPending({ event, action });
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirmHardEdit}>
      {children}
      {pending && (
        <ConfirmCard
          event={pending.event}
          action={pending.action}
          onCancel={() => settle(false)}
          onConfirm={() => settle(true)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

// Split out so it can register as an overlay (ADR-0035 §4) — mounted only while
// pending, its useOverlay makes the return gesture / back cancel the dialog.
function ConfirmCard({
  event,
  action,
  onCancel,
  onConfirm,
}: {
  event: TripEvent;
  action: ConfirmHardEditAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useOverlay(onCancel);
  const cardRef = useRef<HTMLDivElement>(null);
  useDialogFocus(cardRef, onCancel, { trap: true });
  const title = action === 'delete' ? t.confirm.hardDeleteTitle : t.confirm.hardEditTitle;
  const body =
    action === 'delete'
      ? t.confirm.hardDeleteBody(event.title)
      : t.confirm.hardEditBody(event.title);
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        ref={cardRef}
        tabIndex={-1}
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title">
          {ICONS.lock} {title}
        </div>
        <p className="confirm-body">{body}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>
            {t.common.no}
          </button>
          <button className="confirm-ok" onClick={onConfirm}>
            {t.common.yes}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirmHardEdit() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirmHardEdit must be used within <ConfirmProvider>');
  return ctx;
}
