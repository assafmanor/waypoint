// Hard-event edit confirmation gate (T-030 / ADR-0011). A single app-level
// dialog, reached via useConfirmHardEdit() from any screen/verb — so a second
// trigger (e.g. a swipe gesture) opens the same dialog instead of a duplicate.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { TripEvent } from '@waypoint/shared';
import { ICONS } from '../constants';
import { t } from '../i18n/he';

type ConfirmHardEdit = (event: TripEvent) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmHardEdit | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<TripEvent | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirmHardEdit = useCallback<ConfirmHardEdit>(
    (event) =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setPending(event);
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
        <div className="confirm-overlay" onClick={() => settle(false)}>
          <div
            className="confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-label={t.confirm.hardEditTitle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-title">
              {ICONS.lock} {t.confirm.hardEditTitle}
            </div>
            <p className="confirm-body">{t.confirm.hardEditBody(pending.title)}</p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => settle(false)}>
                {t.common.no}
              </button>
              <button className="confirm-ok" onClick={() => settle(true)}>
                {t.common.yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirmHardEdit() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirmHardEdit must be used within <ConfirmProvider>');
  return ctx;
}
