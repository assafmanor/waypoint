// The dev-only override layer behind the map's device-pass panel (ADR-0146 §3).
//
// `constants.ts` stays the single source of truth: nothing here holds a default. A
// reader hands `tune` the constant it is shadowing, and gets it back unless the panel
// has changed it — so the call site still names the number, and the only thing this
// module owns is "has the owner moved it this session".
//
// **In a production build this file contributes an identity function and nothing else.**
// Vite replaces `import.meta.env.DEV` with `false`, the ternary collapses to `base`, and
// `overrides` becomes unreferenced and is tree-shaken along with the panel that writes
// it (mounted behind `import.meta.env.DEV &&`, the mechanism `App.tsx` already uses for
// `DevTimeTravel`).
//
// `import.meta.env` is optional-chained for the reason `constants.ts` records: this
// module sits in the import graph of files Playwright loads in plain Node, where
// `import.meta.env` does not exist and a bare read is a TypeError that fails the whole
// e2e suite at collection.

/** The tunables the device-pass panel exposes, as named constants rather than bare
 *  strings (ADR-0095) — a typo in a key would otherwise be a silent no-override. */
export const TUNE = {
  zoomPlace: 'zoomPlace',
  zoomMaxFit: 'zoomMaxFit',
  zoomStepInMax: 'zoomStepInMax',
  zoomDotBelow: 'zoomDotBelow',
  refitFillShare: 'refitFillShare',
  dragPxPerLevel: 'dragPxPerLevel',
  dragTapGapMs: 'dragTapGapMs',
} as const;
export type DevTunableKey = (typeof TUNE)[keyof typeof TUNE];

const STORAGE_KEY = 'waypoint:dev-tuning';

const overrides: Partial<Record<DevTunableKey, number>> = readStored();

/**
 * The calibratable read. `base` is the constant this shadows, passed at the call site so
 * the number keeps exactly one home.
 *
 * Every one of the seven reads happens **inside a function body** — a camera callback, a
 * `zoom_changed` handler, a pure function — so a new value is picked up by the next fit,
 * the next gesture or the next zoom event. That is what makes the whole mechanism free of
 * props, state and re-renders, which on this surface is what keeps it free of a billed map
 * re-instantiation (ADR-0121 §4, ADR-0122 §9).
 */
export function tune(key: DevTunableKey, base: number): number {
  return import.meta.env?.DEV ? (overrides[key] ?? base) : base;
}

/** Set or (with `undefined`) clear one override. Dev-only by construction — nothing in
 *  the app calls this, only the panel. */
export function setTuning(key: DevTunableKey, value: number | undefined): void {
  if (value === undefined) delete overrides[key];
  else overrides[key] = value;
  writeStored();
}

export function clearTuning(): void {
  for (const key of Object.keys(overrides) as DevTunableKey[]) delete overrides[key];
  writeStored();
}

/** What the owner has changed this session. A copy, so the panel cannot mutate the store
 *  by holding its state. */
export function tuningOverrides(): Partial<Record<DevTunableKey, number>> {
  return { ...overrides };
}

// Persisted per tab, so the HMR reload that follows any edit mid-sitting does not discard
// the afternoon (ADR-0146 §6). `sessionStorage` is absent in Node, and the DEV gate
// already covers that — the `typeof` check is what makes it true rather than incidental.
function readStored(): Partial<Record<DevTunableKey, number>> {
  if (!import.meta.env?.DEV || typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<Record<DevTunableKey, number>> = {};
    for (const key of Object.values(TUNE)) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStored(): void {
  if (!import.meta.env?.DEV || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // A full or blocked storage is not worth failing a dev tool over.
  }
}

/** What the map is doing right now, for the panel's readouts (ADR-0146 §1b). Published by
 *  `DevMapProbe`, which is stateless precisely so publishing costs no render.
 *
 *  **The load-diagnostic fields** (field report #28's device-pass capture, backlog
 *  workstream M) are published from two places, deliberately not one new probe: `apiStatus`
 *  / `apiError` / `tilesLoaded` come straight off `MapPane`'s own production `onError` /
 *  `onTilesLoaded` handlers — the exact signals §1a already decides a failure from, reused
 *  rather than duplicated — and `webglContextLost` / `online` come off `DevMapProbe`, which
 *  listens for the one thing production deliberately does not (a context loss AFTER a map
 *  already rendered once is a different question than "did it ever load"). */
export interface DevMapReading {
  zoom: number | null;
  /** The current renderer attempt phase, or `null` before the pane publishes one. */
  apiStatus: string | null;
  /** The renderer's last error for the current attempt, cleared on retry. */
  apiError: string | null;
  /** Has `onTilesLoaded` fired at least once THIS attempt — the production watchdog's own
   *  success signal (`constants.ts`'s `MAP_LOAD_TIMEOUT_MS.TILES`). */
  tilesLoaded: boolean;
  /** How long that took, measured from the same instant the watchdog starts counting, so
   *  the number and the bound it is judged against share a zero point. `null` until tiles
   *  paint. **This is the measurement workstream M turns on** — the bound is a heuristic
   *  `constants.ts` labels unmeasured, and until a real device says what a SUCCESSFUL first
   *  paint costs there, a failure at 10s cannot be told from a success that was merely slow.
   *  Read here only: production decides from `tilesLoaded`, never from this. */
  tilesLoadedMs: number | null;
  /** The canvas's own `webglcontextlost` (field report #28's likeliest single cause on a
   *  real device) — `null` until a real `<Map>` canvas has been observed. */
  webglContextLost: boolean | null;
  online: boolean;
}
const reading: DevMapReading = {
  zoom: null,
  apiStatus: null,
  apiError: null,
  tilesLoaded: false,
  tilesLoadedMs: null,
  webglContextLost: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};

export function publishMapReading(next: Partial<DevMapReading>): void {
  Object.assign(reading, next);
}
export function mapReading(): DevMapReading {
  return { ...reading };
}
