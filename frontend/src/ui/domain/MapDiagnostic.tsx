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
  /** What `APIProvider.onError` last rejected with, if it ever did. **The discriminator
   *  the first version of this readout was missing**: the owner's map dies silently and
   *  then a FRESH pane errors at once, which means `importLibrary` rejected on a page
   *  where the script had already loaded successfully — and only the message says whether
   *  that was the network, the referrer restriction, or a loader left poisoned. */
  lastError: string | null;
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

/** The hosts Google fetches a vector map's tiles and assets from. */
const TILE_HOSTS = /maps\.googleapis\.com|maps\.gstatic\.com|khms\d*\.googleapis\.com/;

/**
 * **Are tiles even being asked for?**
 *
 * The reading that arrived from the device — `gl:ok canvas:ok pane:411x596 painted:n
 * online:y` — rules out every mechanism fixed so far: the map is constructed, its context
 * is alive, the container has size and the network is up, yet nothing paints. What is left
 * is the network conversation itself, and it splits two ways that need opposite fixes:
 *
 *   - `tiles:0` — the SDK is not requesting at all. Its own internal state is wedged, and
 *     no amount of rebuilding OUR map object will reach that.
 *   - `tiles:N` with an old `last` — it asked, got answers for a while, and then stopped
 *     or started failing.
 *
 * `performance.getEntriesByType('resource')` only lists requests that **completed**, which
 * is the useful bias here: a request that is hanging never appears, so `tiles:0` covers
 * "never asked" and "asked and still waiting" together — both meaning no tile has arrived.
 */
function tileTraffic(sinceMs: number): string {
  try {
    const entries = (
      performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    ).filter((entry) => TILE_HOSTS.test(entry.name));
    const recent = entries.filter((entry) => entry.startTime >= sinceMs);
    const last = entries.at(-1);
    const agoS = last ? Math.round((performance.now() - last.responseEnd) / 100) / 10 : null;
    return `tiles:${recent.length}/${entries.length} last:${agoS == null ? 'never' : `${agoS}s`}`;
  } catch {
    return 'tiles:?';
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
    await fetch(url, { ...init, cache: 'no-store', signal: abort.signal });
    return `${Math.round(performance.now() - started)}ms`;
  } catch (error) {
    return error instanceof Error && error.name === 'AbortError' ? 'HUNG' : 'err';
  } finally {
    clearTimeout(timer);
  }
}

/** The map's own canvas, as the DOM sees it — `none` when vis.gl never constructed one,
 *  which is what a loader stuck below `LOADED` looks like from out here (session 262). */
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
}: {
  paneRef: RefObject<HTMLDivElement | null>;
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
      void Promise.all([
        probe(`${location.origin}/health`),
        probe('https://maps.gstatic.com/generate_204', { mode: 'no-cors' }),
      ]).then(([self, goog]) => setReading((line) => `${line} self:${self} goog:${goog}`));
      setReading(
        [
          `gl:${webglAvailability()}`,
          `canvas:${canvasState(pane)}`,
          `pane:${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'none'}`,
          `painted:${now.painted ? 'y' : 'n'}`,
          tileTraffic(performance.now() - now.elapsedMs),
          serviceWorkerState(),
          `fails:${now.failures}`,
          `resumes:${now.resumes}`,
          `t:${Math.round(now.elapsedMs / 100) / 10}s`,
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
