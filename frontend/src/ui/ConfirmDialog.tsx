// Hard-event edit confirmation gate (T-030 / ADR-0011). A single app-level
// dialog, reached via useConfirmHardEdit() from any screen/verb — so a second
// trigger (e.g. a swipe gesture) opens the same dialog instead of a duplicate.
//
// The rendering is the generic tone="hard" ConfirmDialog (U-02): the overlay
// stack, focus contract, and amber commitment treatment all live in the shared
// primitive now. This file keeps only the provider/context public API intact.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { TripEvent } from '@waypoint/shared';
import { ConfirmDialog } from './primitives/ConfirmDialog';
import { TitleLabel } from './TitleLabel';
import { t } from '../i18n/he';
import { Icon } from './Icon';

export type ConfirmHardEditAction = 'edit' | 'delete';
type ConfirmHardEdit = (
  event: TripEvent,
  action?: ConfirmHardEditAction,
  /** How many notes this event hosts (ADR-0152 §2). Passed in rather than read here: this
   *  provider sits above the trip, and the verb that raises the gate already holds the list. */
  opts?: { notes?: number },
) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmHardEdit | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    event: TripEvent;
    action: ConfirmHardEditAction;
    notes: number;
  } | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirmHardEdit = useCallback<ConfirmHardEdit>(
    (event, action = 'edit', opts) =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setPending({ event, action, notes: opts?.notes ?? 0 });
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setPending(null);
  };

  const title = pending?.action === 'delete' ? t.confirm.hardDeleteTitle : t.confirm.hardEditTitle;
  // The event's title leads the sentence as a node: a flight names its route the
  // same way it does everywhere else, not as the raw stored string.
  const body = pending && (
    <>
      <TitleLabel title={pending.event.title} />{' '}
      {pending.action === 'delete' ? t.confirm.hardDeleteBody : t.confirm.hardEditBody}
    </>
  );

  return (
    <ConfirmContext.Provider value={confirmHardEdit}>
      {children}
      {pending && (
        <ConfirmDialog
          tone="hard"
          icon={<Icon name="lock" />}
          title={title}
          body={body}
          // Only on the delete: an EDIT keeps the event, so it keeps its notes.
          consequence={
            pending.action === 'delete' && pending.notes > 0 ? (
              <>
                <Icon name="clipboard" /> {t.notes.hostDelete(pending.notes)}
              </>
            ) : undefined
          }
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
