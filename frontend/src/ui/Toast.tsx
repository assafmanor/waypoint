// Lightweight confirmation toast. When a verb passes an undo callback, the toast
// shows an "undo" button — this is how undo surfaces (ADR-0019).
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { TOAST_DURATION_MS } from '../constants';
import { t } from '../i18n/he';

type ShowToast = (icon: string, text: string, onUndo?: () => void) => void;

const ToastContext = createContext<ShowToast | null>(null);

interface ToastState {
  icon: string;
  text: string;
  onUndo?: () => void;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback<ShowToast>((icon, text, onUndo) => {
    setToast({ icon, text, onUndo });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  const runUndo = () => {
    toast?.onUndo?.();
    clearTimeout(timer.current);
    setToast(null);
  };

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={'toast' + (toast ? ' show' : '')} role="status" aria-live="polite">
        {toast && (
          <>
            <span className="ic">{toast.icon}</span>
            <span className="txt">{toast.text}</span>
            {toast.onUndo && (
              <button className="undo" onClick={runUndo}>
                {t.common.undo}
              </button>
            )}
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
