// On-screen nav trace for the ADR-0090/0103 system-back model. Gated behind the
// VITE_NAV_DEBUG build-time env var (see lib/navDebug `navDebugEnabled`) — renders
// nothing and attaches no listeners in a production build. Mirrors the interceptor's
// decision (nav-state.tsx) as a PASSIVE observer — it never calls preventDefault, so
// it can't change back behaviour. Kept as a debugging tool, not shipped to users.
import { useEffect, useMemo, useState } from 'react';
import { useReturnControls } from '../state/nav-state';
import { getNow } from '../lib/useClock';
import {
  appendNavLog,
  clearNavLog,
  formatNavLog,
  navDebugEnabled,
  readNavLog,
  type NavDebugEntry,
} from '../lib/navDebug';

interface NavigationLike extends EventTarget {
  currentEntry?: { index: number } | null;
}
function getNavigation(): NavigationLike | undefined {
  return (window as unknown as { navigation?: NavigationLike }).navigation;
}

const here = () => window.location.pathname + window.location.search;

export function NavDebugHud() {
  const enabled = useMemo(() => navDebugEnabled(), []);
  const { classify } = useReturnControls();
  const [log, setLog] = useState<NavDebugEntry[]>(() => readNavLog());
  const [min, setMin] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    appendNavLog({ t: getNow(), kind: 'load', url: here() });
    setLog(readNavLog());

    const nav = getNavigation();
    const onNavigate = (evt: Event) => {
      const e = evt as Event & {
        navigationType?: string;
        destination?: { index?: number };
      };
      if (e.navigationType !== 'traverse') return;
      // Capture the interceptor's exact inputs synchronously (before the browser
      // commits/leaves): cancelable + the current/destination index + the
      // resolveBack action. cancelable=false on a backward traverse is the smoking
      // gun — the interceptor can't stop it, so the app exits.
      const curIdx = nav?.currentEntry?.index ?? null;
      const destIdx = e.destination?.index ?? null;
      const cancelable = evt.cancelable;
      let action = 'n/a';
      let overlay = false;
      try {
        const a = classify();
        action = a.kind;
        overlay = a.kind === 'close-overlay';
      } catch {
        /* classify unavailable — ignore */
      }
      const forward = typeof destIdx === 'number' && typeof curIdx === 'number' && destIdx > curIdx;
      const handled =
        e.navigationType === 'traverse' && cancelable && !forward && action !== 'none';
      // defaultPrevented is only final after every listener ran; this HUD
      // registers before the interceptor (child effects run first), so read it a
      // microtask later.
      queueMicrotask(() => {
        appendNavLog({
          t: getNow(),
          kind: 'back',
          type: e.navigationType,
          cancelable,
          curIdx,
          destIdx,
          action,
          overlay,
          handled,
          prevented: evt.defaultPrevented,
          url: here(),
        });
        setLog(readNavLog());
      });
    };
    const onHide = () => appendNavLog({ t: getNow(), kind: 'hide', url: here() });

    nav?.addEventListener('navigate', onNavigate);
    window.addEventListener('pagehide', onHide);
    return () => {
      nav?.removeEventListener('navigate', onNavigate);
      window.removeEventListener('pagehide', onHide);
    };
  }, [enabled, classify]);

  if (!enabled) return null;

  const navApi = getNavigation();
  const idx = navApi?.currentEntry?.index ?? '?';
  const supported = navApi ? 'yes' : 'NO (no Navigation API)';
  const text = formatNavLog(log);

  const panel: React.CSSProperties = {
    position: 'fixed',
    left: 6,
    right: 6,
    bottom: 6,
    zIndex: 2147483647,
    background: 'rgba(10,12,20,0.92)',
    color: '#d7f0ff',
    font: '11px/1.35 ui-monospace,Menlo,Consolas,monospace',
    border: '1px solid #2b4d6b',
    borderRadius: 8,
    padding: 8,
    direction: 'ltr',
    textAlign: 'left',
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  };
  const btn: React.CSSProperties = {
    font: 'inherit',
    color: '#0a0c14',
    background: '#7fd1ff',
    border: 0,
    borderRadius: 5,
    padding: '3px 8px',
    marginLeft: 6,
  };

  if (min) {
    return (
      <button
        style={{ ...btn, ...panel, right: 'auto', width: 'auto', bottom: 6 }}
        onClick={() => setMin(false)}
      >
        nav-debug: open (idx {String(idx)})
      </button>
    );
  }

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ color: '#7fd1ff' }}>nav-debug</strong>
        <span style={{ marginLeft: 8 }}>
          idx={String(idx)} · api={supported} · events={log.length}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <button
            style={btn}
            onClick={() => {
              void navigator.clipboard?.writeText(text).catch(() => {});
            }}
          >
            copy
          </button>
          <button
            style={btn}
            onClick={() => {
              clearNavLog();
              setLog([]);
            }}
          >
            clear
          </button>
          <button style={btn} onClick={() => setMin(true)}>
            hide
          </button>
        </span>
      </div>
      <textarea
        readOnly
        value={text}
        style={{
          width: '100%',
          height: 150,
          resize: 'vertical',
          background: '#05070d',
          color: '#cfe8ff',
          border: '1px solid #23405a',
          borderRadius: 6,
          font: 'inherit',
          padding: 6,
          whiteSpace: 'pre',
        }}
      />
    </div>
  );
}
