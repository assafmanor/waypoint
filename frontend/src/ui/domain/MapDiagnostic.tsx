// **The reading nobody has ever had** (field report #35, session 267).
//
// Six fixes have shipped for #35 on inference and the mechanism is still unknown, because
// every attempt to reproduce it has failed: on a desktop, `WEBGL_lose_context`, a full
// `Browser.crashGpuProcess`, connectivity flapping and context-budget exhaustion ALL
// recover. Desktop Chrome heals what the reporting phone does not, so the only way to
// learn what is actually true there is to read it there.
//
// **Why not the existing instrument.** ADR-0146's `DevMapTuner` already reports most of
// this — and `lib/dev-tuning.ts` is deliberately tree-shaken out of production, so
// reaching it would mean shipping the constant-override layer to every user to read six
// numbers. This is the six numbers instead: no overrides, no panel, no storage.
//
// It appears ONLY on a pane that is already failing, so a working map never grows a
// debug affordance — and it is collapsed behind one word, because a person looking at a
// broken map wants the map, not a readout.
import { useCallback, useState, type RefObject } from 'react';
import { accessTokenForHeader } from '../../lib/api';
import type { MapTileUrls } from '../../lib/map-config';
import { t } from '../../i18n/he';

export interface MapDiagnosticFacts {
  /** How many consecutive recoveries have failed — the supervisor's own counter. */
  failures: number;
  /** How many times the tab has been resumed since this pane mounted. */
  resumes: number;
  /** Milliseconds since the current attempt started. */
  elapsedMs: number;
  /** Did tiles ever paint on this attempt? Separates "never started" from "started and died". */
  painted: boolean;
  /** **How many tiles of our own ground have loaded and parsed.**
   *
   *  Counted from the renderer's own `sourcedata` events, and it has to be: this field used to be
   *  `performance.getEntriesByType('resource')` filtered to the tile hosts, which was right for
   *  Google and reads **zero forever** for MapLibre — it fetches tiles on a WORKER thread, whose
   *  requests never appear in the main thread's resource timeline. Measured in a real browser
   *  against a working map: `tiles:0`, on a map that was drawing Bangkok perfectly.
   *
   *  It is the field that separates the two blank maps: `tiles:0` is an archive that cannot be
   *  read, and `tiles:N` with nothing on screen is an archive that has no data at this zoom. */
  tiles: number;
  /** The last error the renderer reported, if it ever did. **The discriminator the first
   *  version of this readout was missing**: the owner's map died silently and then a FRESH
   *  pane errored at once, and only the message says which layer that was.
   *
   *  It reads MapLibre's own `error` events now rather than `APIProvider.onError`, and it
   *  gains rather than loses by it — a tile that 404s or an archive that cannot be range-read
   *  says so **in the message**, where Google's loader rejected with nothing about the tiles. */
  lastError: string | null;
  /** **The renderer's own answer about the map it built** — the split the readout could not
   *  make. `tiles:0` says nothing was requested, but not whether the renderer BELIEVES it is
   *  fine, and those are two different bugs needing opposite fixes:
   *
   *    - `none`   — there is no instance, so construction is what failed.
   *    - `nobox`  — an instance exists but has no bounds: it never completed a first render
   *                 pass, and nothing downstream of that will ever ask for a tile.
   *    - `z12@…`  — it has a camera and thinks it has rendered, and is simply not fetching.
   *
   *  **Kept through the renderer swap on the owner's explicit condition** (ADR-0186 §1). The
   *  three-way split is renderer-agnostic by luck rather than design — `getBounds()`,
   *  `getZoom()` and `getCenter()` all exist on both — so what changes is only where the pane
   *  reads them from. And it is the instrument that says which way the swap went: if this
   *  reads healthy on a MapLibre pane that is blank, the fault was never in Google's SDK. */
  sdk: string;
}

/** **Can this page make a NEW WebGL context right now?** The single most discriminating
 *  fact, and the one no other signal carries: if this reads `none`, then no rebuild can
 *  ever work and only a fresh document will — which is precisely what the owner reports
 *  and what nothing here has been able to confirm.
 *
 *  Probed on a throwaway canvas rather than the map's own, so it answers "is WebGL
 *  available to this document" instead of "is that particular canvas alive". The context
 *  is released immediately: asking must not itself consume the budget it is measuring. */
function webglAvailability(): string {
  try {
    const probe = document.createElement('canvas');
    const gl = (probe.getContext('webgl2') ??
      probe.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'none';
    const lost = gl.isContextLost();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return lost ? 'born-lost' : 'ok';
  } catch (error) {
    return `throw:${error instanceof Error ? error.name : 'unknown'}`;
  }
}

/**
 * **Who is answering this page's fetches?**
 *
 * Added last, and on the strongest evidence yet: the device reported `tiles:0/60 err:none`
 * — sixty tile requests completed on the page, then none at all for a freshly built map,
 * with no error. The map has not failed to DRAW tiles; it has stopped ASKING for them, or
 * is asking and getting nothing back.
 *
 * A service worker is the one thing in the page that fits every observation at once: it is
 * terminated when idle (which is "after a while in the background"), every fetch from a
 * controlled page goes through it INCLUDING cross-origin ones, a dead or restarting worker
 * leaves requests hanging with no error, it is ORIGIN-scoped so a new map inherits it, and
 * only a new document re-attaches to a working controller. Desktop keeps workers alive far
 * more aggressively, which is why nothing forced here has ever reproduced this.
 *
 * `waiting` is worth its own field because ADR-0185 deliberately leaves a new build parked
 * rather than self-activating, so a waiting worker is now an ordinary state — and one
 * nobody has checked against this failure.
 */
function serviceWorkerState(): string {
  const container = navigator.serviceWorker;
  if (!container) return 'sw:unsupported';
  const controller = container.controller;
  if (!controller) return 'sw:none';
  return `sw:${controller.state}`;
}

/** How long a probe waits before calling a fetch hung. Long enough that a slow mobile link
 *  is not libelled, short enough that nobody holds a phone waiting for a readout. */
const PROBE_TIMEOUT_MS = 3000;

/**
 * **Does a fetch from this page still complete?** — the measurement the previous fields
 * could not make.
 *
 * `sw:activated` turned out not to discriminate: a controller reads `activated` whether its
 * worker thread is running or has been terminated and is waiting to restart. So the state
 * says nothing about whether requests through it are being answered. This asks directly.
 *
 * Two probes, because the pair is what localises the fault:
 *
 *   - **same-origin** goes through the service worker (it controls this page), so a hang
 *     here means the worker is not answering and NOTHING on the page can fetch — which
 *     would explain tiles stopping with no error, and would move the fix out of `MapPane`
 *     entirely.
 *   - **Google's host** is cross-origin. If this hangs while same-origin is fast, the
 *     worker is fine and something is specific to Google's requests.
 *
 * `no-cors` on the second because we cannot read the response and do not need to: the only
 * question is whether the promise SETTLES. A 404 settles, and answers it just as well.
 */
async function probe(url: string, init?: RequestInit): Promise<string> {
  const started = performance.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, cache: 'no-store', signal: abort.signal });
    // **THE STATUS, NOT JUST THE TIMING** — and the milliseconds alone cost three rounds of
    // diagnosis on 2026-08-14. `tile:101ms` was read twice as "the archive is fine": it means only
    // that the request SETTLED, and a 401, a 503 and a 206 all settle in about the same time. The
    // reading has to distinguish them, because those are three different bugs with three different
    // fixes, and the person holding the phone should not have to be asked again.
    return `${res.status}/${Math.round(performance.now() - started)}ms`;
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'HUNG' : 'err';
  } finally {
    clearTimeout(timer);
  }
}

/** The map's own canvas, as the DOM sees it — `none` when the renderer never constructed one,
 *  which under Google was a loader stuck below `LOADED` (session 262) and is now the narrower
 *  and more answerable "the module or the protocol failed". */
function canvasState(pane: HTMLElement | null): string {
  const canvas = pane?.querySelector('canvas');
  if (!canvas) return 'none';
  try {
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'no-gl';
    return gl.isContextLost() ? 'LOST' : 'ok';
  } catch {
    return 'throw';
  }
}

/**
 * One line of facts, behind one word.
 *
 * Deliberately Latin and mono: it is data to be screenshotted and read by someone
 * debugging, not UI copy. `dir="auto"` resolves it left-to-right without forcing a
 * direction on the element (ADR-0118 — `dir="ltr"` is lint-blocked and would be wrong).
 */
export function MapDiagnostic({
  paneRef,
  facts,
  urls,
}: {
  paneRef: RefObject<HTMLDivElement | null>;
  /** **The archives the canvas was actually handed**, not freshly derived ones. Probing what the
   *  renderer was given is the difference between reporting on the map on screen and reporting on
   *  a map that would be built next — the mistake ADR-0146 §5 had to amend once already. */
  urls: MapTileUrls;
  /** **A getter, not a value** — and the difference was a wrong number on a real phone.
   *  Sampled at render, `failures` went stale the moment a second failure changed no state
   *  (`tilesLate` already true → React bails out → no re-render), so the readout said
   *  `fails:1` for two dead contexts. Everything else here is read at the tap; this is now
   *  read there too. It also stops allocating a facts object every second on a screen that
   *  ticks. */
  facts: () => MapDiagnosticFacts;
}) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState('');

  // Read at the moment of the tap, never on render: a value sampled every render would
  // be a live probe running on a screen that re-renders every second, and `webglAvailability`
  // creates a context each time it is asked.
  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) return false;
      const now = facts();
      const pane = paneRef.current;
      const box = pane?.getBoundingClientRect();
      // The two fetch probes are asynchronous, so the line is shown at once and gains
      // `self:`/`goog:` when they settle — a readout that appeared only after a 3s
      // timeout would look like the bug it is diagnosing.
      // The second probe is the TILE ARCHIVE now, not a Google host — which makes the pair
      // strictly more useful than it was. Both go through the service worker, so a hang on
      // `self:` still means nothing on the page can fetch; but where `goog:` could only say
      // "Google is reachable", `tile:` asks the one question that matters, and it asks for one
      // byte so a 42.7 MB archive is not downloaded to answer it.
      // **The tile probe carries the app's token, because the real read does.** Without it this
      // asked a different question than the renderer asks — an unauthenticated 401 in 100ms, read
      // as health — which is exactly how the 2026-08-14 diagnosis went wrong twice. One byte, so a
      // 42.7 MB archive is not downloaded to answer it.
      const token = accessTokenForHeader();
      const range: RequestInit = {
        headers: {
          Range: 'bytes=0-0',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      };
      void Promise.all([
        probe(`${location.origin}/health`),
        probe(urls.world, range),
        urls.trip ? probe(urls.trip, range) : Promise.resolve('none'),
      ]).then(([self, world, extract]) =>
        setReading((line) => `${line} self:${self} world:${world} extract:${extract}`),
      );
      setReading(
        [
          `gl:${webglAvailability()}`,
          `canvas:${canvasState(pane)}`,
          `pane:${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none'}`,
          `painted:${now.painted ? 'y' : 'n'}`,
          `tiles:${now.tiles}`,
          serviceWorkerState(),
          `fails:${now.failures}`,
          `resumes:${now.resumes}`,
          `t:${Math.round(now.elapsedMs / 100) / 10}s`,
          `sdk:${now.sdk}`,
          `online:${navigator.onLine ? 'y' : 'n'}`,
          `vis:${document.visibilityState[0]}`,
          // Last, because it is the longest and the only free-form field — and the one
          // most likely to name the cause outright.
          `err:${now.lastError ?? 'none'}`,
        ].join(' '),
      );
      return true;
    });
  }, [paneRef, facts]);

  return (
    <div className="map-diag">
      <button type="button" className="map-diag-toggle" onClick={toggle} aria-expanded={open}>
        {t.map.diagnostic}
      </button>
      {open && (
        <output className="map-diag-out" dir="auto">
          {reading}
        </output>
      )}
    </div>
  );
}
