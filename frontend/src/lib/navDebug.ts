// Nav diagnostics for the ADR-0090/0103 system-back model, kept in the tree as a
// debugging tool and gated behind the `VITE_NAV_DEBUG` build-time env var (the master
// switch — see `navDebugEnabled`). Inert in a production build (env var unset), so it
// ships nothing to users unless a build deliberately turns it on (e.g. staging). It
// records, for every system-back, the exact inputs the interceptor decides on (nav
// index, whether the traversal was cancelable, the resolveBack action) and persists
// them to localStorage so the trace SURVIVES the app being killed — the whole point,
// since an exit destroys any on-screen state. A passive observer of the `navigate`
// event; never touches the real nav logic. Its HUD lives in `ui/NavDebugHud.tsx`.
const FLAG_KEY = 'wp_nav_debug';
const LOG_KEY = 'wp_nav_debug_log';
const MAX_ENTRIES = 60;

export interface NavDebugEntry {
  t: number; // epoch ms
  kind: 'back' | 'load' | 'hide';
  type?: string; // navigationType
  cancelable?: boolean;
  curIdx?: number | null;
  destIdx?: number | null;
  action?: string; // resolveBack kind
  overlay?: boolean; // an overlay/back-layer was open
  handled?: boolean; // interceptor would preventDefault (predicted)
  prevented?: boolean; // e.defaultPrevented after dispatch (observed)
  url: string;
}

/** Master switch: the `VITE_NAV_DEBUG` build-time env var (`'1'`/`'true'`). Unset in a
 *  production build → the HUD is fully inert. When the build has it on, the HUD shows
 *  by default; `?debug=off` hides it for the session (sticky in localStorage) and
 *  `?debug=nav` re-enables it. */
export function navDebugEnabled(): boolean {
  try {
    const envOn =
      import.meta.env.VITE_NAV_DEBUG === '1' || import.meta.env.VITE_NAV_DEBUG === 'true';
    if (!envOn) return false;
    const p = new URLSearchParams(window.location.search).get('debug');
    if (p === 'off') localStorage.setItem(FLAG_KEY, 'off');
    if (p === 'nav') localStorage.removeItem(FLAG_KEY);
    return localStorage.getItem(FLAG_KEY) !== 'off';
  } catch {
    return false;
  }
}

export function readNavLog(): NavDebugEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as NavDebugEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendNavLog(entry: NavDebugEntry): void {
  try {
    const log = readNavLog();
    log.push(entry);
    while (log.length > MAX_ENTRIES) log.shift();
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* storage full / unavailable — diagnostics only, ignore */
  }
}

export function clearNavLog(): void {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* ignore */
  }
}

export function formatNavLog(log: NavDebugEntry[]): string {
  return log
    .map((e) => {
      const time = new Date(e.t).toISOString().slice(11, 23);
      if (e.kind === 'load') return `${time}  ── LOAD  ${e.url}`;
      if (e.kind === 'hide') return `${time}  ── HIDE  ${e.url}`;
      return (
        `${time}  BACK type=${e.type} cancelable=${e.cancelable} ` +
        `idx=${e.curIdx}->${e.destIdx} action=${e.action} overlay=${e.overlay} ` +
        `handled=${e.handled} prevented=${e.prevented}  ${e.url}`
      );
    })
    .join('\n');
}
