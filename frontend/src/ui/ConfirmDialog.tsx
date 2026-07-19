// Hard-event edit confirmation gate (T-030 / ADR-0011). A single app-level
// dialog, reached via useConfirmHardEdit() from any screen/verb — so a second
// trigger (e.g. a swipe gesture) opens the same dialog instead of a duplicate.
//
// The rendering is the generic tone="hard" ConfirmDialog (U-02): the overlay
// stack, focus contract, and amber commitment treatment all live in the shared
// primitive now. This file keeps only the provider/context public API intact.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { TripEvent } from '@waypoint/shared';
import { ICONS } from '../constants';
import { ConfirmDialog } from './primitives/ConfirmDialog';
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

  const title = pending?.action === 'delete' ? t.confirm.hardDeleteTitle : t.confirm.hardEditTitle;
  const body = pending
    ? pending.action === 'delete'
      ? t.confirm.hardDeleteBody(pending.event.title)
      : t.confirm.hardEditBody(pending.event.title)
    : '';

  return (
    <ConfirmContext.Provider value={confirmHardEdit}>
      {children}
      {pending && (
        <ConfirmDialog
          tone="hard"
          icon={ICONS.lock}
          title={title}
          body={body}
          confirmLabel={t.common.yes}
          cancelLabel={t.common.no}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirmHardEdit() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirmHardEdit must be used within <ConfirmProvider>');
  return ctx;
}
